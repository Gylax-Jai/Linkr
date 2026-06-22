import { Schema, model, type InferSchemaType } from "mongoose";
import { VISIBILITY_VALUES } from "@linkr/shared";

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
    privacy: {
      lastSeen: { type: String, enum: VISIBILITY_VALUES, default: "friends" },
      profile: { type: String, enum: ["everyone", "friends"], default: "everyone" },
      whoCanRequest: { type: String, enum: ["everyone", "nobody"], default: "everyone" },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export const UserModel = model("User", userSchema);
