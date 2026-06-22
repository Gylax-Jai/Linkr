import type { ID, Timestamp } from "./common.js";

export type MessageType = "text" | "image" | "video" | "file" | "voice";

export type MessageStatus = "sent" | "delivered" | "read";

export interface Reaction {
  user: ID;
  emoji: string;
}

/**
 * A single message (blueprint §12). `content` holds ciphertext only — the server
 * never stores readable message bodies (E2EE, blueprint §9).
 */
export interface Message {
  _id: ID;
  chatId: ID;
  sender: ID;
  type: MessageType;
  content?: string;
  /**
   * True when `content` is an end-to-end-encrypted envelope (Phase 2) rather than plaintext.
   * The server never reads encrypted bodies; only chat members can decrypt them client-side.
   */
  encrypted?: boolean;
  /** URL of the attachment (Cloudinary secure URL, or the authenticated local-download route). */
  mediaUrl?: string;
  /** Sanitized original filename, kept as display metadata only (never used for storage). */
  mediaName?: string;
  /** Size of the attachment in bytes. */
  mediaSize?: number;
  /** Server-validated MIME type of the attachment. */
  mediaMime?: string;
  replyTo?: ID;
  reactions: Reaction[];
  pinned: boolean;
  deletedFor: ID[];
  deletedForEveryone: boolean;
  status: MessageStatus;
  readBy: ID[];
  createdAt: Timestamp;
  editedAt?: Timestamp;
}
