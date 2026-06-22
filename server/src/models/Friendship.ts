import { Schema, model, Types, type InferSchemaType } from "mongoose";
import { FRIENDSHIP_STATUSES } from "@linkr/shared";

/** Friendship model (blueprint §12): one doc per relationship, unique on (requester, recipient). */
const friendshipSchema = new Schema(
  {
    requester: { type: Types.ObjectId, ref: "User", required: true, index: true },
    recipient: { type: Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: FRIENDSHIP_STATUSES, default: "pending" },
    actionBy: { type: Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

friendshipSchema.index({ requester: 1, recipient: 1 }, { unique: true });

export type FriendshipDoc = InferSchemaType<typeof friendshipSchema>;
export const FriendshipModel = model("Friendship", friendshipSchema);
