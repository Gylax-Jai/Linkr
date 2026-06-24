import type { CallMedia } from "@linkr/shared";
import type { CameraFacing } from "./callConfig";
import { applyVideoBitrate, applyAudioBitrate, mediaConstraints, tuneOpus, videoConstraintsForFacing } from "./callConfig";
import { isMobilePhone, supportsSetSinkId } from "./audioRoute";

interface CallEngineCallbacks {
  onIceCandidate: (candidate: RTCIceCandidateInit) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  /** Optional — UI should prefer `onConnectionStateChange("connected")` for the active phase. */
  onRemoteStream?: (stream: MediaStream) => void;
  /** Fired once local capture is ready (drives the local video preview for video calls). */
  onLocalStream?: (stream: MediaStream) => void;
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
  private speakerAudioCtx: AudioContext | null = null;
  private speakerAudioSource: MediaStreamAudioSourceNode | null = null;
  private mobileSpeakerMode = false;
  private sinkCandidates: string[] = [""];
  private activeSinkId = "";
  private readonly media: CallMedia;
  private readonly cb: CallEngineCallbacks;
  /** Camera currently captured for video calls (front by default). Toggled by `switchCamera`. */
  private cameraFacing: CameraFacing = "user";

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
      this.cb.onRemoteStream?.(this.remoteStream);
    };
  }

  async startLocalMedia(preloaded?: MediaStream | null): Promise<void> {
    // Reuse the early-captured stream when it satisfies the call's media needs (audio always; for
    // video it must also carry a camera track), otherwise capture fresh per `mediaConstraints`.
    const needsVideo = this.media === "video";
    const canReuse =
      !!preloaded &&
      preloaded.getAudioTracks().length > 0 &&
      (!needsVideo || preloaded.getVideoTracks().length > 0);
    this.localStream = canReuse
      ? (preloaded as MediaStream)
      : await navigator.mediaDevices.getUserMedia(mediaConstraints(this.media));
    for (const track of this.localStream.getTracks()) {
      const sender = this.pc.addTrack(track, this.localStream);
      if (track.kind === "audio") void applyAudioBitrate(sender);
      else if (track.kind === "video") void applyVideoBitrate(sender);
    }
    this.cb.onLocalStream?.(this.localStream);
  }

  /** Local capture stream (drives the local video preview). Null until `startLocalMedia` runs. */
  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  /** Remote media stream (accumulates the peer's audio + video tracks). */
  getRemoteStream(): MediaStream {
    return this.remoteStream;
  }

  /** Enable/disable the outgoing camera track (video calls). Audio is controlled by `setMuted`. */
  setCameraEnabled(enabled: boolean): void {
    this.localStream?.getVideoTracks().forEach((t) => {
      t.enabled = enabled;
    });
  }

  /** Which camera is currently captured (front/rear). Drives the local-preview mirror (Sprint 3.2.2). */
  getCameraFacing(): CameraFacing {
    return this.cameraFacing;
  }

  /**
   * Flip between front and rear cameras on mobile (Sprint 3.2.2). Captures the other camera, swaps the
   * track on the existing RTCRtpSender via `replaceTrack` (no renegotiation), and updates the local
   * preview in place. Returns the new facing, or the unchanged facing if the device has one camera.
   */
  async switchCamera(): Promise<CameraFacing> {
    if (this.media !== "video" || !this.localStream) return this.cameraFacing;

    const next: CameraFacing = this.cameraFacing === "user" ? "environment" : "user";
    const oldTrack = this.localStream.getVideoTracks()[0];
    const wasEnabled = oldTrack?.enabled ?? true;

    let newStream: MediaStream;
    try {
      newStream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraintsForFacing(next),
        audio: false,
      });
    } catch {
      // Device likely has no second camera (or permission denied) — keep the current one.
      return this.cameraFacing;
    }

    const newTrack = newStream.getVideoTracks()[0];
    if (!newTrack) return this.cameraFacing;
    newTrack.enabled = wasEnabled;

    const sender = this.pc.getSenders().find((s) => s.track?.kind === "video");
    if (sender) {
      await sender.replaceTrack(newTrack);
      void applyVideoBitrate(sender);
    }

    if (oldTrack) {
      this.localStream.removeTrack(oldTrack);
      oldTrack.stop();
    }
    this.localStream.addTrack(newTrack);
    this.cameraFacing = next;
    // Re-emit the same stream object so the preview re-binds and picks up the new track.
    this.cb.onLocalStream?.(this.localStream);
    return next;
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

  /**
   * Mobile Chrome cannot select earpiece/speaker with setSinkId. Best effort:
   * normal `<audio>` lets Android route to BT/earpiece; Web Audio often routes via loudspeaker.
   */
  async setMobileSpeakerMode(enabled: boolean): Promise<boolean> {
    if (!isMobilePhone()) return false;
    this.mobileSpeakerMode = enabled;
    this.ensureRemoteElement();
    if (enabled) {
      return this.playRemoteViaBestEffortSpeaker();
    }
    this.stopBestEffortSpeaker();
    if (this.remoteAudio) {
      this.remoteAudio.muted = false;
      this.remoteAudio.volume = 1;
      if (this.remoteStream.getTracks().length > 0) {
        this.remoteAudio.srcObject = this.remoteStream;
      }
      await this.remoteAudio.play().catch(() => {});
    }
    return true;
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
    if (this.mobileSpeakerMode && isMobilePhone()) {
      void this.playRemoteViaBestEffortSpeaker();
    } else {
      this.remoteAudio.muted = false;
      this.remoteAudio.volume = 1;
      void this.remoteAudio.play().catch(() => {});
    }
    if (supportsSetSinkId() && this.activeSinkId) {
      void this.trySetSink(this.activeSinkId);
    }
  }

  private async playRemoteViaBestEffortSpeaker(): Promise<boolean> {
    if (!this.remoteAudio || this.remoteStream.getTracks().length === 0) return false;

    // Keep the media element attached so Chrome keeps the WebRTC stream flowing, but mute its
    // direct output to avoid double playback while Web Audio tries the loudspeaker/media route.
    this.remoteAudio.srcObject = this.remoteStream;
    this.remoteAudio.muted = true;
    await this.remoteAudio.play().catch(() => {});

    if (!this.speakerAudioCtx) {
      this.speakerAudioCtx = new AudioContext();
    }
    if (this.speakerAudioSource) {
      try {
        this.speakerAudioSource.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.speakerAudioSource = this.speakerAudioCtx.createMediaStreamSource(this.remoteStream);
    this.speakerAudioSource.connect(this.speakerAudioCtx.destination);
    await this.speakerAudioCtx.resume().catch(() => {});
    return true;
  }

  private stopBestEffortSpeaker(): void {
    if (this.speakerAudioSource) {
      try {
        this.speakerAudioSource.disconnect();
      } catch {
        /* ignore */
      }
      this.speakerAudioSource = null;
    }
  }

  close(): void {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.remoteStream.getTracks().forEach((t) => t.stop());
    this.stopBestEffortSpeaker();
    if (this.speakerAudioCtx) {
      void this.speakerAudioCtx.close();
      this.speakerAudioCtx = null;
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
