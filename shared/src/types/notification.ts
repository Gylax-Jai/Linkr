import type { ID, Timestamp } from "./common.js";
import type { PublicUser } from "./user.js";

/** In-app notification kind (Sprint 5). */
export type NotificationType = "friend_request" | "friend_accepted" | "message";

/**
 * Client-facing notification (Sprint 5). Persisted per recipient and pushed live over the
 * `notification:new` socket event. Message previews are short and plaintext-only for now —
 * full message bodies are never stored here or logged.
 */
export interface NotificationDTO {
  _id: ID;
  type: NotificationType;
  /** The user who triggered the notification (friend requester / message sender). */
  actor?: PublicUser;
  /** Chat to open when a message notification is clicked. */
  chatId?: ID;
  /** Friendship this notification refers to (friend_request) — enables inline accept/reject. */
  friendshipId?: ID;
  /** Short preview text (e.g. truncated message body or "sent you a photo"). */
  messagePreview?: string;
  read: boolean;
  createdAt: Timestamp;
}

export interface NotificationListResponse {
  notifications: NotificationDTO[];
}

export interface UnreadCountResponse {
  count: number;
}
