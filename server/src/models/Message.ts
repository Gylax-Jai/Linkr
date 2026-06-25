import { Schema, model, Types, type InferSchemaType } from "mongoose";
import { MESSAGE_TYPES, MESSAGE_STATUSES } from "@linkr/shared";

/**
 * Message model (blueprint §12). `content` holds ciphertext only — the server never
 * stores readable message bodies (E2EE, blueprint §9).
 */
const messageSchema = new Schema(
  {
    chatId: { type: Types.ObjectId, ref: "Chat", required: true, index: true },
    sender: { type: Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: MESSAGE_TYPES, default: "text" },
    content: { type: String },
    /**
     * True when `content` is an end-to-end-encrypted envelope (Phase 2, blueprint §9). The server
     * stores it verbatim and never reads it; only chat members can decrypt client-side.
     */
    encrypted: { type: Boolean, default: false },
    mediaUrl: { type: String },
    /** Cloudinary public_id for lifecycle deletion (not exposed to clients). */
    mediaCloudId: { type: String },
    /** Sanitized original filename — display metadata only, never used for storage. */
    mediaName: { type: String },
    /** Attachment size in bytes. */
    mediaSize: { type: Number },
    /** Server-validated MIME type of the attachment. */
    mediaMime: { type: String },
    replyTo: { type: Types.ObjectId, ref: "Message" },
    /**
     * Call-log metadata for `type: "call"` rows (Sprint 3.1.1). This is activity metadata
     * (media/outcome/duration), like WhatsApp's call entries — never message content.
     */
    call: {
      type: new Schema(
        {
          media: { type: String, enum: ["audio", "video"], required: true },
          outcome: {
            type: String,
            enum: ["completed", "missed", "declined", "cancelled", "failed"],
            required: true,
          },
          durationSec: { type: Number },
        },
        { _id: false },
      ),
      required: false,
    },
    /** Group poll metadata for `type: "poll"` rows (Phase 7A). */
    poll: {
      type: new Schema(
        {
          question: { type: String, required: true },
          options: [
            {
              id: { type: String, required: true },
              text: { type: String, required: true },
            },
          ],
          votes: [
            {
              user: { type: Types.ObjectId, ref: "User", required: true },
              optionId: { type: String, required: true },
            },
          ],
        },
        { _id: false },
      ),
      required: false,
    },
    reactions: [
      {
        user: { type: Types.ObjectId, ref: "User", required: true },
        emoji: { type: String, required: true },
      },
    ],
    pinned: { type: Boolean, default: false },
    /** True when this message was created by forwarding another message (Phase 4). */
    forwarded: { type: Boolean, default: false },
    deletedFor: [{ type: Types.ObjectId, ref: "User" }],
    deletedForEveryone: { type: Boolean, default: false },
    status: { type: String, enum: MESSAGE_STATUSES, default: "sent" },
    readBy: [{ type: Types.ObjectId, ref: "User" }],
    editedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type MessageDoc = InferSchemaType<typeof messageSchema>;
export const MessageModel = model("Message", messageSchema);
