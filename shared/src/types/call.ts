import type { PublicUser } from "./user.js";

/**
 * Calls (Phase 3). Signaling payloads + ICE config. Media never touches the server — these types
 * only describe the Socket.IO control messages and the TURN/STUN config the client fetches over REST.
 */

/** What kind of call. 3.1 ships `audio`; `video` is added in 3.2 (same engine). */
export type CallMedia = "audio" | "video";

/** Caller → server. The server resolves the peer from `chatId` and re-checks friendship. */
export interface CallInitiatePayload {
  /** Client-generated correlation id (UUID) tying every signal of one call together. */
  callId: string;
  chatId: string;
  media: CallMedia;
}

/**
 * Server → caller ack for `call:initiate`. `ok` gates whether the call proceeds; `ringing` is true
 * when the callee has a live device (show "Ringing…") and false when they're offline ("Calling…").
 */
export interface CallInitiateAck {
  ok: boolean;
  /** Failure code when `ok` is false: INVALID / NOT_ALLOWED / BUSY / ERROR. */
  reason?: string;
  /** True when the callee is connected (ringing now); false when offline (calling, may go unanswered). */
  ringing?: boolean;
}

/** How a call finished — drives the in-chat call-log label. */
export type CallOutcome = "completed" | "missed" | "declined" | "cancelled" | "failed";

/**
 * Metadata for a call-log chat message (a `type: "call"` message). Stored in cleartext — it's
 * activity metadata (like WhatsApp's call entries), never message content.
 */
export interface CallLogMeta {
  media: CallMedia;
  outcome: CallOutcome;
  /** Connected duration in whole seconds (present only when `outcome === "completed"`). */
  durationSec?: number;
}

/** Server → callee: a call is ringing. */
export interface CallIncomingPayload {
  callId: string;
  chatId: string;
  media: CallMedia;
  /** The caller's public profile (name/avatar) for the incoming-call UI. */
  from: PublicUser;
}

/**
 * Callee → server acknowledgement of a `call:incoming` event (Phase 3.1.7). The server retries
 * delivery until it receives this ack or the call rings out, so a missed/late socket no longer
 * silently drops the incoming call.
 */
export interface CallIncomingAck {
  ok: boolean;
}

/** Response of `call:sync` — active server-side call for this user, or null. */
export type CallSyncRole = "caller" | "callee";

export type CallSyncPhase = "incoming" | "outgoing" | "connecting";

export interface CallSyncReplay {
  /** Callee should treat as accepted; caller should run offer flow. */
  accepted?: boolean;
  offer?: WebRtcSdpPayload;
  answer?: WebRtcSdpPayload;
}

export interface CallSyncActiveCall {
  callId: string;
  chatId: string;
  media: CallMedia;
  role: CallSyncRole;
  phase: CallSyncPhase;
  peer: PublicUser;
  /** Outgoing only — callee has a live device. */
  ringing?: boolean;
  replay?: CallSyncReplay;
}

export interface CallSyncResponse {
  call: CallSyncActiveCall | null;
}

/** Generic per-call control message (accept / reject / end / busy / unavailable). */
export interface CallSignalPayload {
  callId: string;
  chatId: string;
}

/** WebRTC SDP exchange (offer/answer), relayed verbatim between peers. */
export interface WebRtcSdpPayload {
  callId: string;
  chatId: string;
  /** Serialized `RTCSessionDescriptionInit` ({ type, sdp }). */
  description: { type: "offer" | "answer"; sdp?: string };
}

/** A single ICE candidate, relayed verbatim between peers (trickle ICE). */
export interface WebRtcIceCandidatePayload {
  callId: string;
  chatId: string;
  /** Serialized `RTCIceCandidateInit`. */
  candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null; usernameFragment?: string | null };
}

/** One STUN/TURN server entry (shape matches the browser's `RTCIceServer`). */
export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Response of `GET /api/calls/ice-config` — short-lived TURN credentials + STUN. */
export interface IceConfigResponse {
  iceServers: IceServerConfig[];
  /** Unix seconds when the TURN credentials expire (clients can refetch before this). */
  ttl: number;
}
