import { create } from "zustand";
import type { CallMedia, PublicUser } from "@linkr/shared";
import type { AudioRoute, AudioRouteKind } from "@/features/calls/audioRoute";

/**
 * Call state machine (Phase 3). One active call at a time. The CallProvider drives transitions
 * from socket + WebRTC events; the UI (overlay / incoming modal) renders off this state.
 *
 *   idle → outgoing → connecting → active → ended → idle
 *   idle → incoming → connecting → active → ended → idle
 */
export type CallPhase = "idle" | "outgoing" | "incoming" | "connecting" | "active" | "ended";

/** Whether the in-call surface is full-screen or collapsed to the slim bar (call runs in background). */
export type CallUiMode = "expanded" | "minimized";

/** Why a call finished — drives the toast/label shown briefly before returning to idle. */
export type CallEndReason =
  | "hangup"
  | "rejected"
  | "unavailable"
  | "busy"
  | "failed"
  | "no-mic"
  | "cancelled";

interface CallState {
  phase: CallPhase;
  callId: string | null;
  chatId: string | null;
  media: CallMedia;
  direction: "outgoing" | "incoming" | null;
  /** The other party's public profile (for the call UI). */
  peer: PublicUser | null;
  muted: boolean;
  /** The current call-audio output route kind (drives the audio button icon/label). */
  audioRoute: AudioRouteKind;
  /** Output device id currently in use ("" = OS default) — lets the picker mark the active row. */
  audioDeviceId: string;
  /** All output routes available on this device (drives the audio-route dropdown). */
  availableRoutes: AudioRoute[];
  /** Full-screen vs minimized bar. Minimizing keeps the call alive in the background. */
  uiMode: CallUiMode;
  /**
   * Outgoing only: true when the callee has a live device (show "Ringing…"), false when offline
   * (show "Calling…", may ring out to a missed call).
   */
  ringing: boolean;
  /** Epoch ms when the call connected — drives the in-call duration timer. */
  connectedAt: number | null;
  /** Live RTCPeerConnection state for the quality/connection indicator. */
  connection: RTCPeerConnectionState;
  endReason: CallEndReason | null;
  /** Brief user-visible message (e.g. mic denied) — cleared automatically by CallProvider. */
  callNotice: string | null;
  /** Video calls (Sprint 3.2): true when the local camera track is disabled. */
  cameraOff: boolean;
  /** Local capture stream — drives the local video preview (video calls). */
  localStream: MediaStream | null;
  /** Remote media stream — drives the full-screen remote video (video calls). */
  remoteStream: MediaStream | null;

  startOutgoing: (args: { callId: string; chatId: string; media: CallMedia; peer: PublicUser }) => void;
  receiveIncoming: (args: { callId: string; chatId: string; media: CallMedia; peer: PublicUser }) => void;
  /** Restore UI from server `call:sync` after reconnect (Phase 3.1.6). */
  restoreFromSync: (args: {
    callId: string;
    chatId: string;
    media: CallMedia;
    peer: PublicUser;
    role: "caller" | "callee";
    phase: "incoming" | "outgoing" | "connecting";
    ringing?: boolean;
  }) => void;
  setConnecting: () => void;
  setActive: () => void;
  setConnection: (state: RTCPeerConnectionState) => void;
  setRinging: (ringing: boolean) => void;
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;
  toggleCamera: () => void;
  setCameraOff: (cameraOff: boolean) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  setAudioRoute: (route: AudioRouteKind, deviceId: string) => void;
  setAvailableRoutes: (routes: AudioRoute[]) => void;
  setCallNotice: (callNotice: string | null) => void;
  minimize: () => void;
  expand: () => void;
  endCall: (reason: CallEndReason) => void;
  reset: () => void;
}

const initial = {
  phase: "idle" as CallPhase,
  callId: null,
  chatId: null,
  media: "audio" as CallMedia,
  direction: null,
  peer: null,
  muted: false,
  audioRoute: "default" as AudioRouteKind,
  audioDeviceId: "",
  availableRoutes: [] as AudioRoute[],
  // Calls open full-screen; the user minimizes (down-arrow / tap outside) to a top bar to keep it
  // running in the background.
  uiMode: "expanded" as CallUiMode,
  ringing: false,
  connectedAt: null,
  connection: "new" as RTCPeerConnectionState,
  endReason: null,
  callNotice: null,
  cameraOff: false,
  localStream: null as MediaStream | null,
  remoteStream: null as MediaStream | null,
};

export const useCallStore = create<CallState>((set) => ({
  ...initial,

  startOutgoing: ({ callId, chatId, media, peer }) =>
    set({ ...initial, phase: "outgoing", direction: "outgoing", callId, chatId, media, peer }),

  receiveIncoming: ({ callId, chatId, media, peer }) =>
    set({ ...initial, phase: "incoming", direction: "incoming", callId, chatId, media, peer }),

  restoreFromSync: ({ callId, chatId, media, peer, role, phase, ringing }) =>
    set({
      ...initial,
      phase,
      direction: role === "caller" ? "outgoing" : "incoming",
      callId,
      chatId,
      media,
      peer,
      ringing: ringing ?? false,
    }),

  setConnecting: () => set({ phase: "connecting" }),

  setActive: () => set((s) => ({ phase: "active", connectedAt: s.connectedAt ?? Date.now() })),

  setConnection: (connection) => set({ connection }),
  setRinging: (ringing) => set({ ringing }),

  toggleMute: () => set((s) => ({ muted: !s.muted })),
  setMuted: (muted) => set({ muted }),

  toggleCamera: () => set((s) => ({ cameraOff: !s.cameraOff })),
  setCameraOff: (cameraOff) => set({ cameraOff }),
  setLocalStream: (localStream) => set({ localStream }),
  setRemoteStream: (remoteStream) => set({ remoteStream }),

  setAudioRoute: (audioRoute, audioDeviceId) => set({ audioRoute, audioDeviceId }),
  setAvailableRoutes: (availableRoutes) => set({ availableRoutes }),
  setCallNotice: (callNotice) => set({ callNotice }),

  minimize: () => set({ uiMode: "minimized" }),
  expand: () => set({ uiMode: "expanded" }),

  endCall: (reason) => set({ phase: "ended", endReason: reason }),

  reset: () => set({ ...initial }),
}));
