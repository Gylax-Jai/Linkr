/**
 * Socket.IO event names (blueprint §11), centralized so client and server can never
 * drift apart. Every event is re-checked for friendship/permission on the server first.
 */
export const SOCKET_EVENTS = {
  // Presence
  USER_ONLINE: "user:online",
  USER_OFFLINE: "user:offline",
  USER_TYPING: "user:typing",

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

  // Calls (Phase 2)
  CALL_INITIATE: "call:initiate",
  CALL_ACCEPT: "call:accept",
  CALL_REJECT: "call:reject",
  CALL_END: "call:end",
  WEBRTC_OFFER: "webrtc:offer",
  WEBRTC_ANSWER: "webrtc:answer",
  WEBRTC_ICE_CANDIDATE: "webrtc:ice-candidate",

  // Screen share (Phase 2)
  SCREEN_START: "screen:start",
  SCREEN_STOP: "screen:stop",
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
