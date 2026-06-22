import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * OTP model (blueprint §12). Only the HASH of the code is stored, with a TTL on expiry.
 * The `phone` field holds the HMAC of the E.164 number (not plaintext) so phone numbers are
 * never persisted in the clear. `lastSentAt` powers per-phone resend rate limiting.
 */
const otpSchema = new Schema({
  // HMAC of the phone (see utils/crypto.hashPhone) — one active OTP per phone.
  phone: { type: String, required: true, unique: true },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  lastSentAt: { type: Date, required: true },
});

// TTL index — MongoDB auto-removes expired OTP documents.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type OtpDoc = InferSchemaType<typeof otpSchema>;
export const OtpModel = model("Otp", otpSchema);
