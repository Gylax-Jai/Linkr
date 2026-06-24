import type { CallMedia } from "@linkr/shared";
import { applyAudioBitrate, mediaConstraints, tuneOpus } from "./callConfig";
import { isMobilePhone } from "./audioRoute";

interface CallEngineCallbacks {
  /** A locally-gathered ICE candidate to relay to the peer (trickle ICE). */
  onIceCandidate: (candidate: RTCIceCandidateInit) => void;
  /** The peer connection state changed (drives connected/failed transitions). */
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  /** The first remote track arrived (call is producing media). */
  onRemoteStream: (stream: MediaStream) => void;
}

type SinkCapable = { setSinkId?: (id: string) => Promise<void> };

/**
 * Thin, quality-tuned wrapper around RTCPeerConnection for 1:1 calls. Handles local capture,
 * Opus tuning, trickle ICE and remote playback. Signaling (who sends what to whom) lives in the
 * CallProvider; the engine is transport-only and has no knowledge of sockets.
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
  private readonly useWebAudio = isMobilePhone();
  private readonly media: CallMedia;
  private readonly cb: CallEngineCallbacks;

  constructor(iceServers: RTCIceServer[], media: CallMedia, callbacks: CallEngineCallbacks) {
    this.media = media;
    this.cb = callbacks;
    this.pc = new RTCPeerConnection({
      iceServers,
      // Bundle + rtcp-mux keep ports minimal and connect faster.
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

  /**
   * Capture the local mic (and camera for video) and attach tracks to the connection. An already-
   * captured `preloaded` audio stream (e.g. the caller's early mic grab, which unlocks device labels
   * while "Calling…") is reused for audio calls to avoid a second permission prompt; video always
   * (re)captures so the camera is included.
   */
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

  /** Whether the local mic stream has been captured (so mute can apply pre-connect). */
  hasLocalMedia(): boolean {
    return this.localStream !== null;
  }

  /** Caller: create + return a quality-tuned offer. */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer();
    offer.sdp = offer.sdp ? tuneOpus(offer.sdp) : offer.sdp;
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  /** Callee: create + return a quality-tuned answer (call after setting the remote offer). */
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
      // Candidates can arrive before the remote description; browsers buffer most, ignore races.
    }
  }

  /** Mute/unmute the local mic by toggling track enabled (keeps the connection up). */
  setMuted(muted: boolean): void {
    this.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }

  /**
   * Apply an ordered list of sink ids until one succeeds. On mobile we route through Web Audio
   * (`AudioContext.setSinkId`) because Android Chrome often ignores `HTMLAudioElement.setSinkId`.
   */
  async applyOutputRoute(candidates: string[]): Promise<void> {
    this.sinkCandidates = candidates.length ? candidates : [""];
    await this.applySinkCandidates();
  }

  /** Single sink id — wraps applyOutputRoute for callers that only have one id. */
  async setSinkId(deviceId: string): Promise<void> {
    await this.applyOutputRoute([deviceId]);
  }

  /** A simple connection-quality read for the in-call indicator (RTT in ms, or null). */
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

  private async applySinkCandidates(): Promise<void> {
    for (const id of this.sinkCandidates) {
      if (await this.trySetSink(id)) return;
    }
  }

  private async trySetSink(deviceId: string): Promise<boolean> {
    if (this.useWebAudio && this.audioCtx) {
      const ctx = this.audioCtx as AudioContext & SinkCapable;
      if (typeof ctx.setSinkId === "function") {
        try {
          await ctx.setSinkId(deviceId);
          return true;
        } catch {
          /* try next candidate / fallback path */
        }
      }
    }

    const el = this.remoteAudio as (HTMLAudioElement & SinkCapable) | null;
    if (el) {
      el.volume = 1;
      if (typeof el.setSinkId === "function") {
        try {
          await el.setSinkId(deviceId);
          return true;
        } catch {
          /* try next candidate */
        }
      }
    }

    return false;
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
    void this.remoteAudio.play().catch(() => {
      /* Autoplay may be blocked until a user gesture; the accept/start click satisfies it. */
    });
  }

  /** Tear everything down: stop local capture, stop playback, close the connection. */
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
