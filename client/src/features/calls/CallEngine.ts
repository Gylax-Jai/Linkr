import type { CallMedia } from "@linkr/shared";
import { applyAudioBitrate, mediaConstraints, tuneOpus } from "./callConfig";
import { supportsSetSinkId } from "./audioRoute";

interface CallEngineCallbacks {
  onIceCandidate: (candidate: RTCIceCandidateInit) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onRemoteStream: (stream: MediaStream) => void;
}

type SinkCapable = { setSinkId?: (id: string) => Promise<void>; sinkId?: string };

/**
 * WebRTC wrapper for 1:1 calls. All platforms play remote audio through a plain `<audio>` element
 * so mobile OS can route to Bluetooth / earpiece. Desktop switching uses setSinkId (Sprint 3.1.7).
 */
export class CallEngine {
  private pc: RTCPeerConnection;
  private localStream: MediaStream | null = null;
  private remoteStream = new MediaStream();
  private remoteAudio: HTMLAudioElement | null = null;
  private sinkCandidates: string[] = [""];
  private activeSinkId = "";
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

  async applyOutputRoute(candidates: string[]): Promise<boolean> {
    if (!supportsSetSinkId()) return false;
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
    if (this.remoteAudio) return;
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

  /** Chromium desktop: detach srcObject → setSinkId → reattach → play. */
  private async trySetSink(deviceId: string): Promise<boolean> {
    const el = this.remoteAudio as (HTMLAudioElement & SinkCapable) | null;
    if (!el || typeof el.setSinkId !== "function") return false;

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
    if (!this.remoteAudio) {
      this.remoteAudio = new Audio();
      this.remoteAudio.autoplay = true;
    }
    this.remoteAudio.srcObject = this.remoteStream;
    void this.remoteAudio.play().catch(() => {});
    if (supportsSetSinkId() && this.activeSinkId) {
      void this.trySetSink(this.activeSinkId);
    }
  }

  close(): void {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.remoteStream.getTracks().forEach((t) => t.stop());
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
