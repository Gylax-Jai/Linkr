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

/** Server → callee: a call is ringing. */
export interface CallIncomingPayload {
  callId: string;
  chatId: string;
  media: CallMedia;
  /** The caller's public profile (name/avatar) for the incoming-call UI. */
  from: PublicUser;
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
