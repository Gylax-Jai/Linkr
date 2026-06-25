import { Schema, model, Types, type InferSchemaType } from "mongoose";

/**
 * User support query (Phase 7D). Stored in MongoDB for manual review — no outbound email.
 * Captures who sent it plus the message body at submission time.
 */
const supportMessageSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: "User", required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    username: { type: String, trim: true },
    message: { type: String, required: true, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

supportMessageSchema.index({ createdAt: -1 });

export type SupportMessageDoc = InferSchemaType<typeof supportMessageSchema>;
export const SupportMessageModel = model("SupportMessage", supportMessageSchema);
