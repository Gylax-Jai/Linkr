import { create } from "zustand";
import type { CallMedia, PublicUser } from "@linkr/shared";

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
  /** Speaker (loudspeaker) routing toggle — applied to the remote audio sink where supported. */
  speakerOn: boolean;
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

  startOutgoing: (args: { callId: string; chatId: string; media: CallMedia; peer: PublicUser }) => void;
  receiveIncoming: (args: { callId: string; chatId: string; media: CallMedia; peer: PublicUser }) => void;
  setConnecting: () => void;
  setActive: () => void;
  setConnection: (state: RTCPeerConnectionState) => void;
  setRinging: (ringing: boolean) => void;
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;
  toggleSpeaker: () => void;
  setSpeaker: (on: boolean) => void;
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
  speakerOn: false,
  uiMode: "expanded" as CallUiMode,
  ringing: false,
  connectedAt: null,
  connection: "new" as RTCPeerConnectionState,
  endReason: null,
};

export const useCallStore = create<CallState>((set) => ({
  ...initial,

  startOutgoing: ({ callId, chatId, media, peer }) =>
    set({ ...initial, phase: "outgoing", direction: "outgoing", callId, chatId, media, peer }),

  receiveIncoming: ({ callId, chatId, media, peer }) =>
    set({ ...initial, phase: "incoming", direction: "incoming", callId, chatId, media, peer }),

  setConnecting: () => set({ phase: "connecting" }),

  setActive: () => set((s) => ({ phase: "active", connectedAt: s.connectedAt ?? Date.now() })),

  setConnection: (connection) => set({ connection }),
  setRinging: (ringing) => set({ ringing }),

  toggleMute: () => set((s) => ({ muted: !s.muted })),
  setMuted: (muted) => set({ muted }),

  toggleSpeaker: () => set((s) => ({ speakerOn: !s.speakerOn })),
  setSpeaker: (speakerOn) => set({ speakerOn }),

  minimize: () => set({ uiMode: "minimized" }),
  expand: () => set({ uiMode: "expanded" }),

  endCall: (reason) => set({ phase: "ended", endReason: reason }),

  reset: () => set({ ...initial }),
}));
