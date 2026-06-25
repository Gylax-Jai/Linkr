/**
 * Socket.IO event names (blueprint §11), centralized so client and server can never
 * drift apart. Every event is re-checked for friendship/permission on the server first.
 */
export const SOCKET_EVENTS = {
  // Presence
  USER_ONLINE: "user:online",
  USER_OFFLINE: "user:offline",
  USER_TYPING: "user:typing",
  /** Sender stopped typing (clears the indicator immediately on the peer). */
  USER_TYPING_STOP: "user:typing-stop",
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
  /** Group poll vote changed — carries the updated message (Phase 7A). */
  MESSAGE_POLL_VOTE: "message:poll-vote",
  MESSAGE_EDIT: "message:edit",

  // Calls (Phase 3). Signaling only — media is peer-to-peer (WebRTC). Every event is
  // re-checked server-side for an accepted friendship before relaying to the peer.
  CALL_INITIATE: "call:initiate",
  /** Server → callee: an incoming call is ringing (carries the caller's public profile). */
  CALL_INCOMING: "call:incoming",
  /** Callee → server: device received `call:incoming` (Phase 3.1.9 — replaces Socket.IO server-side ack). */
  CALL_INCOMING_ACK: "call:incoming-ack",
  /** Server → caller: the callee's device acknowledged the incoming call (true "Ringing…"). */
  CALL_RINGING: "call:ringing",
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

  /** Client reconnect — restore server-side active call (Phase 3.1.6). */
  CALL_SYNC: "call:sync",
  /** Client idle after reload — drop unanswered ghost sessions for this user (Phase 3.1.6). */
  CALL_CLEAR_STALE: "call:clear-stale",

  // Screen share (Phase 3)
  SCREEN_START: "screen:start",
  SCREEN_STOP: "screen:stop",

  /** Group metadata changed (Phase 6E) — members should refetch the chat list. */
  GROUP_UPDATED: "group:updated",
  /** Group was deleted (last member left) — remove from lists and close the active chat. */
  GROUP_DELETED: "group:deleted",
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
