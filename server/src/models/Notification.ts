import { Schema, model, Types, type InferSchemaType } from "mongoose";
import { NOTIFICATION_TYPES } from "@linkr/shared";

/**
 * In-app notification (Sprint 5). One document per recipient + event. `messagePreview` holds a
 * short, plaintext snippet only — full message bodies are never stored here (and never logged).
 */
const notificationSchema = new Schema(
  {
    /** Recipient — every query is scoped to the authenticated user via this field. */
    user: { type: Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    /** Who triggered it (friend requester / message sender). */
    actor: { type: Types.ObjectId, ref: "User" },
    /** Chat to open when a message notification is clicked. */
    chatId: { type: Types.ObjectId, ref: "Chat" },
    /** Friendship referenced by a friend_request notification (enables inline accept/reject). */
    friendshipId: { type: Types.ObjectId, ref: "Friendship" },
    messagePreview: { type: String },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Common access pattern: newest-first list for a given recipient.
notificationSchema.index({ user: 1, createdAt: -1 });

export type NotificationDoc = InferSchemaType<typeof notificationSchema>;
export const NotificationModel = model("Notification", notificationSchema);
