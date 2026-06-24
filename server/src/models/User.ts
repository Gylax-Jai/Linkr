import { Schema, model, type InferSchemaType } from "mongoose";
import { ACCOUNT_STATUSES, PROFILE_VISIBILITY_VALUES, VISIBILITY_VALUES } from "@linkr/shared";

/**
 * User model (blueprint §12). A user is created at first Google login BEFORE onboarding, so
 * `username` and phone fields are optional until the onboarding flow fills them in.
 *
 * Phone privacy (blueprint §4): the raw number is never stored. `phoneEnc` holds an AES-256-GCM
 * blob for retrieval, and `phoneHash` (HMAC of the E.164 number) is a sparse-unique index that
 * enforces "ONE account per phone" without exposing the plaintext. Neither is ever returned by
 * the API.
 */
const userSchema = new Schema(
  {
    googleId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Sparse + unique: many pre-onboarding users have no username, but set ones must be unique.
    username: { type: String, unique: true, sparse: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    avatar: { type: String },
    bio: { type: String },
    status: { type: String },
    /**
     * Optional auto-expiry for `status` (Sprint C.1). When set and in the past, the status is
     * treated as cleared (filtered out on read). Null/absent means the status never expires.
     */
    statusExpiresAt: { type: Date },
    onboarded: { type: Boolean, default: false },

    // Encrypted phone storage — never serialized to clients.
    phoneEnc: { type: String, select: false },
    phoneHash: { type: String, unique: true, sparse: true, select: false },
    phoneVerified: { type: Boolean, default: false },

    lastSeen: { type: Date },
    online: { type: Boolean, default: false },

    /**
     * E2EE public key (Phase 2, blueprint §9): the user's current base64 X25519 public key so
     * friends can encrypt to them. Public by design; the matching private key never leaves the
     * owner's browser. Absent for accounts that have never run the web client (e.g. the dev bot).
     */
    publicKey: { type: String },

    /**
     * Account-level E2EE key backup (Sprint D). The owner's keypair encrypted client-side with a key
     * derived from their recovery passphrase. The server stores this opaque blob so a NEW device can
     * restore the account keypair (with the passphrase) and read history — it can NEVER decrypt it.
     * `select: false` so it's only ever returned by the dedicated self endpoint, never leaked by a
     * profile/participant mapper. Cleared automatically when the public key changes (key reset).
     */
    keyBackup: {
      type: {
        v: { type: Number },
        salt: { type: String },
        nonce: { type: String },
        ciphertext: { type: String },
        opslimit: { type: Number },
        memlimit: { type: Number },
      },
      select: false,
      _id: false,
      default: undefined,
    },

    /**
     * Single-use recovery-code envelopes (Sprint D.1). Each is the account keypair sealed under a
     * high-entropy backup CODE (Argon2id + secretbox), so a user who lost their passphrase can still
     * restore on a new device by redeeming one code (gated by a phone OTP). `idHash` is the SHA-256
     * of the code — the server's lookup id; it never sees the code itself and can't open the blob.
     * `used` burns a code after redemption. Cleared (like `keyBackup`) when the public key changes.
     */
    recoveryCodes: {
      type: [
        {
          idHash: { type: String, required: true },
          v: { type: Number },
          salt: { type: String },
          nonce: { type: String },
          ciphertext: { type: String },
          opslimit: { type: Number },
          memlimit: { type: Number },
          used: { type: Boolean, default: false },
          usedAt: { type: Date },
        },
      ],
      select: false,
      _id: false,
      default: undefined,
    },
    privacy: {
      lastSeen: { type: String, enum: VISIBILITY_VALUES, default: "friends" },
      profile: { type: String, enum: PROFILE_VISIBILITY_VALUES, default: "friends" },
      whoCanRequest: { type: String, enum: ["everyone", "nobody"], default: "everyone" },
    },

    /**
     * Account lifecycle (Phase 4). `active` is the norm. `deactivated` marks a soft-deleted account:
     * it's signed out everywhere and scheduled for permanent purge at `scheduledPurgeAt`, but logging
     * back in via Google reactivates it (clearing these fields). An immediate deletion skips this and
     * purges the document outright.
     */
    accountStatus: { type: String, enum: ACCOUNT_STATUSES, default: "active", index: true },
    deactivatedAt: { type: Date },
    /** When a deactivated account becomes eligible for permanent deletion (read by the purge job). */
    scheduledPurgeAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export const UserModel = model("User", userSchema);
