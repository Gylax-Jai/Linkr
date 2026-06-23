import type { CallMedia } from "@linkr/shared";
import { applyAudioBitrate, mediaConstraints, tuneOpus } from "./callConfig";

interface CallEngineCallbacks {
  /** A locally-gathered ICE candidate to relay to the peer (trickle ICE). */
  onIceCandidate: (candidate: RTCIceCandidateInit) => void;
  /** The peer connection state changed (drives connected/failed transitions). */
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  /** The first remote track arrived (call is producing media). */
  onRemoteStream: (stream: MediaStream) => void;
}

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
  /** Desired output device id; re-applied whenever the remote audio element is (re)created. */
  private sinkId = "";
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
   * Route remote audio to a specific output device (Sprint 3.1.2). `deviceId` comes from the
   * audioRoute manager; "" = system default. Best-effort: `setSinkId` is Chromium-only, so on
   * unsupported browsers this no-ops and the OS handles routing. Always keeps full volume.
   */
  async setSinkId(deviceId: string): Promise<void> {
    this.sinkId = deviceId;
    const el = this.remoteAudio as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!el) return;
    el.volume = 1;
    if (typeof el.setSinkId !== "function") return;
    try {
      await el.setSinkId(deviceId);
    } catch {
      // setSinkId can reject (no permission / device gone); keep the current sink.
    }
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

  private playRemote(): void {
    if (!this.remoteAudio) {
      this.remoteAudio = new Audio();
      this.remoteAudio.autoplay = true;
    }
    this.remoteAudio.srcObject = this.remoteStream;
    void this.remoteAudio.play().catch(() => {
      /* Autoplay may be blocked until a user gesture; the accept/start click satisfies it. */
    });
    // Re-apply the desired output device now that the element exists.
    if (this.sinkId) void this.setSinkId(this.sinkId);
  }

  /** Tear everything down: stop local capture, stop playback, close the connection. */
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
