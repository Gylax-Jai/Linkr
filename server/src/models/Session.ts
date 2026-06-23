import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * Login session / device record (Sprint E). One document per signed-in device, created at Google
 * login and referenced by `sid` inside the refresh + access tokens. Its existence is what makes a
 * session valid: deleting it (remote logout) makes that device's next token refresh fail, forcing a
 * re-login. We store only a friendly label + coarse metadata — never tokens or secrets.
 *
 * A TTL index on `lastSeenAt` prunes stale sessions a bit after the refresh token would have expired
 * anyway (7d), so the device list never accrues dead rows.
 */
const sessionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    /** Human-friendly device label derived from the user agent, e.g. "Chrome on Windows". */
    label: { type: String, required: true },
    /** Raw user agent (truncated) for debugging / future detail; never shown verbatim as the label. */
    userAgent: { type: String },
    /** Best-effort client IP at last refresh (coarse; behind a proxy depends on trust-proxy config). */
    ip: { type: String },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Auto-expire sessions ~8 days after their last refresh (just past the 7d refresh-token TTL).
sessionSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 8 * 24 * 60 * 60 });

export type SessionDoc = InferSchemaType<typeof sessionSchema>;
export const SessionModel = model("Session", sessionSchema);
