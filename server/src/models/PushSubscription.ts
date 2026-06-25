import { Schema, model, Types, type InferSchemaType } from "mongoose";

/** Web Push subscription for background notifications (Phase 5 / 7B). */
const pushSubscriptionSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    expirationTime: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);

pushSubscriptionSchema.index({ user: 1, endpoint: 1 }, { unique: true });

export type PushSubscriptionDoc = InferSchemaType<typeof pushSubscriptionSchema>;
export const PushSubscriptionModel = model("PushSubscription", pushSubscriptionSchema);
