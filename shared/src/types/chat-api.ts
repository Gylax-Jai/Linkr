import type { ID, Timestamp } from "./common.js";
import type { CallLogMeta } from "./call.js";
import type { FriendshipDirection, FriendshipStatus } from "./friendship.js";
import type { MessageStatus, MessageType, Reaction } from "./message.js";

/** Friendship context for the conversation participant, relative to the current user. */
export interface ChatParticipantFriendship {
  status: FriendshipStatus;
  /** True when the current user placed an active block on the participant (can unblock). */
  blockedByMe: boolean;
  /**
   * For a pending request, its direction relative to the current user (Sprint 5.7) so the chat UI
   * can show "Requested"/Cancel (outgoing) vs "Accept" (incoming).
   */
  direction?: FriendshipDirection;
  /** Friendship doc id (Sprint 5.7) so the chat UI can accept/reject/cancel without a re-fetch. */
  friendshipId?: ID;
}

/** Participant summary embedded in chat list responses. */
export interface ChatParticipant {
  _id: ID;
  username?: string;
  displayName: string;
  avatar?: string;
  online: boolean;
  lastSeen?: Timestamp;
  /** False when the participant's privacy hides last-seen/online from the viewer (Phase 4.2). */
  presenceVisible?: boolean;
  /** False when bio/status are hidden by the participant's profile privacy (Phase 4.2). */
  profileDetailsVisible?: boolean;
  /** False when the participant hid their contact card from non-friends (profile → Nobody). */
  contactCardVisible?: boolean;
  /** Profile bio shown in the contact details "About" section (Sprint C.1). */
  bio?: string;
  /** Free-text custom status (e.g. "At the gym"); shown under the name in the chat header (Sprint C.1). */
  status?: string;
  /** Relationship between the current user and this participant (Sprint 5.5). */
  friendship?: ChatParticipantFriendship;
}

/** Minimal preview of the message a reply points to (Sprint 4). */
export interface ReplyPreview {
  _id: ID;
  sender: ID;
  content?: string;
  /** True when `content` is an E2EE envelope (Phase 2) — the client decrypts it for the preview. */
  encrypted?: boolean;
  deleted: boolean;
}

/** Client-facing message (Sprint 4: reply / edit / react / delete). */
export interface MessageDTO {
  _id: ID;
  chatId: ID;
  sender: ID;
  type: MessageType;
  content?: string;
  /**
   * True when `content` is an end-to-end-encrypted envelope (Phase 2). The client decrypts it
   * locally; when false/absent the content is plaintext (e.g. the dev bot, which has no key).
   */
  encrypted?: boolean;
  status: MessageStatus;
  readBy: ID[];
  createdAt: Timestamp;
  /** Attachment URL (Cloudinary secure URL, or the authenticated local-download route). */
  mediaUrl?: string;
  /** Media kind (reuses MessageType: image / file / video / voice). */
  mediaType?: MessageType;
  /** Sanitized original filename for display (never used for storage). */
  mediaName?: string;
  /** Attachment size in bytes. */
  mediaSize?: number;
  /** Server-validated MIME type of the attachment. */
  mediaMime?: string;
  /** Message this one replies to, hydrated to a small preview. */
  replyTo?: ReplyPreview;
  /** Present only for `type: "call"` rows — the call's media/outcome/duration (Sprint 3.1.1). */
  call?: CallLogMeta;
  /** Emoji reactions (one per user; toggling replaces the previous). */
  reactions: Reaction[];
  /** Set when the message body was edited in place. */
  editedAt?: Timestamp;
  /** True when this message was created by forwarding another message (Phase 4). */
  forwarded?: boolean;
  /** True when the sender deleted the message for everyone (body is cleared). */
  deletedForEveryone: boolean;
}

/** Chat list row returned by GET /api/chat. */
export interface ChatListItem {
  _id: ID;
  /** "self" is the user's own "Saved messages" chat (Sprint C.2); otherwise a 1:1. */
  type: "1:1" | "self";
  participant: ChatParticipant;
  lastMessage?: MessageDTO;
  pinned: boolean;
  /** Notifications for this chat are silenced for the current user (Phase 4). */
  muted: boolean;
  /** Hidden from the main list into the Archived section for the current user (Phase 4). */
  archived: boolean;
  unreadCount: number;
  updatedAt: Timestamp;
}
