import type { CallMedia } from "@linkr/shared";
import { applyAudioBitrate, mediaConstraints, tuneOpus } from "./callConfig";
import { isMobilePhone, supportsSetSinkId } from "./audioRoute";

interface CallEngineCallbacks {
  onIceCandidate: (candidate: RTCIceCandidateInit) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onRemoteStream: (stream: MediaStream) => void;
}

type SinkCapable = { setSinkId?: (id: string) => Promise<void>; sinkId?: string };

/**
 * Thin WebRTC wrapper for 1:1 calls. Desktop output switching uses the Chromium detach →
 * setSinkId → reattach pattern so BT → laptop speakers actually moves audio.
 */
export class CallEngine {
  private pc: RTCPeerConnection;
  private localStream: MediaStream | null = null;
  private remoteStream = new MediaStream();
  private remoteAudio: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;
  /** Ordered sink ids to try (from resolveSinkCandidates). */
  private sinkCandidates: string[] = [""];
  /** Last sink id applied successfully — re-applied when the remote element is (re)created. */
  private activeSinkId = "";
  private readonly useWebAudio = isMobilePhone();
  private readonly media: CallMedia;
  private readonly cb: CallEngineCallbacks;

  constructor(iceServers: RTCIceServer[], media: CallMedia, callbacks: CallEngineCallbacks) {
    this.media = media;
    this.cb = callbacks;
    this.pc = new RTCPeerConnection({
      iceServers,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });

    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.cb.onIceCandidate(e.candidate.toJSON());
    };
    this.pc.onconnectionstatechange = () => {
      this.cb.onConnectionStateChange(this.pc.connectionState);
    };
    this.pc.ontrack = (e) => {
      this.remoteStream.addTrack(e.track);
      this.playRemote();
      this.cb.onRemoteStream(this.remoteStream);
    };
  }

  async startLocalMedia(preloaded?: MediaStream | null): Promise<void> {
    this.localStream =
      preloaded && this.media === "audio" && preloaded.getAudioTracks().length > 0
        ? preloaded
        : await navigator.mediaDevices.getUserMedia(mediaConstraints(this.media));
    for (const track of this.localStream.getTracks()) {
      const sender = this.pc.addTrack(track, this.localStream);
      if (track.kind === "audio") void applyAudioBitrate(sender);
    }
  }

  hasLocalMedia(): boolean {
    return this.localStream !== null;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer();
    offer.sdp = offer.sdp ? tuneOpus(offer.sdp) : offer.sdp;
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    const answer = await this.pc.createAnswer();
    answer.sdp = answer.sdp ? tuneOpus(answer.sdp) : answer.sdp;
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(desc);
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    try {
      await this.pc.addIceCandidate(candidate);
    } catch {
      /* races with remote description */
    }
  }

  setMuted(muted: boolean): void {
    this.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }

  /**
   * Try each candidate sink id until one applies. Returns true if any candidate succeeded.
   * Creates the playback element early on desktop so routing works before the remote track arrives.
   */
  async applyOutputRoute(candidates: string[]): Promise<boolean> {
    this.sinkCandidates = candidates.length ? candidates : [""];
    this.ensureRemoteElement();
    return this.applySinkCandidates();
  }

  async setSinkId(deviceId: string): Promise<boolean> {
    return this.applyOutputRoute([deviceId]);
  }

  getActiveSinkId(): string {
    return this.activeSinkId;
  }

  async getRoundTripMs(): Promise<number | null> {
    try {
      const stats = await this.pc.getStats();
      let rtt: number | null = null;
      stats.forEach((report) => {
        if (report.type === "candidate-pair" && report.nominated && typeof report.currentRoundTripTime === "number") {
          rtt = Math.round(report.currentRoundTripTime * 1000);
        }
      });
      return rtt;
    } catch {
      return null;
    }
  }

  private ensureRemoteElement(): void {
    if (this.useWebAudio || this.remoteAudio) return;
    this.remoteAudio = new Audio();
    this.remoteAudio.autoplay = true;
    if (this.remoteStream.getTracks().length > 0) {
      this.remoteAudio.srcObject = this.remoteStream;
    }
  }

  private async applySinkCandidates(): Promise<boolean> {
    for (const id of this.sinkCandidates) {
      if (await this.trySetSink(id)) return true;
    }
    return false;
  }

  /**
   * Chromium: detach srcObject → setSinkId → reattach → play.
   * Without detach, switching away from Bluetooth often keeps audio on the BT device.
   */
  private async trySetSink(deviceId: string): Promise<boolean> {
    if (this.useWebAudio) {
      return false;
    }

    const el = this.remoteAudio as (HTMLAudioElement & SinkCapable) | null;
    if (!el || typeof el.setSinkId !== "function") {
      return !supportsSetSinkId();
    }

    el.volume = 1;
    const stream = el.srcObject as MediaStream | null;

    try {
      if (stream) el.srcObject = null;
      await el.setSinkId(deviceId);
      if (stream) {
        el.srcObject = stream;
        await el.play();
      }
      this.activeSinkId = deviceId;
      return true;
    } catch {
      if (stream && el.srcObject !== stream) {
        el.srcObject = stream;
        void el.play().catch(() => {});
      }
      return false;
    }
  }

  private playRemote(): void {
    if (this.useWebAudio) {
      this.playRemoteViaWebAudio();
    } else {
      this.playRemoteViaElement();
    }
    void this.applySinkCandidates();
  }

  private playRemoteViaWebAudio(): void {
    /* Mobile only — Web Audio lacks setSinkId on phone browsers; OS owns routing. */
    if (!this.audioCtx) {
      this.audioCtx = new AudioContext();
    }
    if (this.audioSource) {
      try {
        this.audioSource.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.audioSource = this.audioCtx.createMediaStreamSource(this.remoteStream);
    this.audioSource.connect(this.audioCtx.destination);
    void this.audioCtx.resume();
  }

  private playRemoteViaElement(): void {
    if (!this.remoteAudio) {
      this.remoteAudio = new Audio();
      this.remoteAudio.autoplay = true;
    }
    this.remoteAudio.srcObject = this.remoteStream;
    void this.remoteAudio.play().catch(() => {});
    if (this.activeSinkId) {
      void this.trySetSink(this.activeSinkId);
    }
  }

  close(): void {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.remoteStream.getTracks().forEach((t) => t.stop());
    if (this.audioSource) {
      try {
        this.audioSource.disconnect();
      } catch {
        /* ignore */
      }
      this.audioSource = null;
    }
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null;
      this.remoteAudio = null;
    }
    this.pc.onicecandidate = null;
    this.pc.onconnectionstatechange = null;
    this.pc.ontrack = null;
    try {
      this.pc.close();
    } catch {
      /* already closed */
    }
  }
}
