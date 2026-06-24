/**
 * Socket.IO event names (blueprint §11), centralized so client and server can never
 * drift apart. Every event is re-checked for friendship/permission on the server first.
 */
export const SOCKET_EVENTS = {
  // Presence
  USER_ONLINE: "user:online",
  USER_OFFLINE: "user:offline",
  USER_TYPING: "user:typing",
  /** A user's profile or privacy changed — viewers should refresh their cached peer profile. */
  USER_PROFILE_CHANGED: "user:profile-changed",

  // Friends
  FRIEND_REQUEST: "friend:request",
  FRIEND_ACCEPTED: "friend:accepted",
  FRIEND_REJECTED: "friend:rejected",
  /** An accepted friendship was removed (unfriend) — emitted to the other user (Sprint 5.6). */
  FRIEND_REMOVED: "friend:removed",

  // Notifications (in-app, Sprint 5) — emitted to `user:<recipientId>`.
  NOTIFICATION_NEW: "notification:new",

  // Chat
  MESSAGE_SEND: "message:send",
  MESSAGE_NEW: "message:new",
  MESSAGE_DELIVERED: "message:delivered",
  MESSAGE_READ: "message:read",
  MESSAGE_PIN: "message:pin",
  MESSAGE_DELETE: "message:delete",
  MESSAGE_REACT: "message:react",
  MESSAGE_EDIT: "message:edit",

  // Calls (Phase 3). Signaling only — media is peer-to-peer (WebRTC). Every event is
  // re-checked server-side for an accepted friendship before relaying to the peer.
  CALL_INITIATE: "call:initiate",
  /** Server → callee: an incoming call is ringing (carries the caller's public profile). */
  CALL_INCOMING: "call:incoming",
  CALL_ACCEPT: "call:accept",
  CALL_REJECT: "call:reject",
  CALL_END: "call:end",
  /** Server → caller: the callee is offline / has no active device. */
  CALL_UNAVAILABLE: "call:unavailable",
  /** Server → caller: the callee is already on another call. */
  CALL_BUSY: "call:busy",
  WEBRTC_OFFER: "webrtc:offer",
  WEBRTC_ANSWER: "webrtc:answer",
  WEBRTC_ICE_CANDIDATE: "webrtc:ice-candidate",

  // Screen share (Phase 3)
  SCREEN_START: "screen:start",
  SCREEN_STOP: "screen:stop",
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
