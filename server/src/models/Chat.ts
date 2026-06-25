import { Schema, model, Types, type InferSchemaType } from "mongoose";
import { CHAT_TYPES, GROUP_MESSAGE_PERMISSION_VALUES } from "@linkr/shared";

/** Chat model (blueprint §12): 1:1 or group conversation. */
const chatSchema = new Schema(
  {
    type: { type: String, enum: CHAT_TYPES, default: "1:1" },
    members: [{ type: Types.ObjectId, ref: "User", required: true }],
    admins: [{ type: Types.ObjectId, ref: "User" }],
    name: { type: String },
    avatar: { type: String },
    /** Who may send messages in this group (admin-only setting). */
    messagePermission: {
      type: String,
      enum: GROUP_MESSAGE_PERMISSION_VALUES,
      default: "everyone",
    },
    pinnedBy: [{ type: Types.ObjectId, ref: "User" }],
    /** Per-user mute: members who silenced notifications for this chat (Phase 4). */
    mutedBy: [{ type: Types.ObjectId, ref: "User" }],
    /** Per-user archive: members who moved this chat into their Archived section (Phase 4). */
    archivedBy: [{ type: Types.ObjectId, ref: "User" }],
    /** Per-user soft delete: members who hid this chat from THEIR list (never affects the other side). */
    hiddenFor: [{ type: Types.ObjectId, ref: "User" }],
    lastMessage: { type: Types.ObjectId, ref: "Message" },
  },
  { timestamps: true },
);

export type ChatDoc = InferSchemaType<typeof chatSchema>;
export const ChatModel = model("Chat", chatSchema);
