import { z } from "zod";
import { OTP_CODE_LENGTH, PHONE_E164_REGEX } from "../constants/limits.js";

/**
 * E2EE public-key schemas (Phase 2, blueprint §9). A user publishes their X25519 public key so
 * friends can encrypt to them; the matching private key never leaves the browser (IndexedDB).
 */

/** A base64-encoded 32-byte X25519 public key (44 chars incl. padding). Bounded to resist abuse. */
const base64Key = z
  .string()
  .trim()
  .min(32)
  .max(128)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Public key must be base64");

/** POST /api/keys — publish (or rotate) the current user's public key. */
export const publishKeySchema = z.object({
  publicKey: base64Key,
});

/** Route param: whose public key to fetch. */
export const keyUserParamSchema = z.object({
  userId: z.string().min(1),
});

export type PublishKeyInput = z.infer<typeof publishKeySchema>;

/** A base64 blob (salt/nonce/ciphertext) in an encrypted key backup. Bounded to resist abuse. */
const base64Blob = z
  .string()
  .trim()
  .min(1)
  .max(20000)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Must be base64");

/**
 * The encrypted account-key backup (Sprint D). The server validates the envelope shape only — it can
 * never decrypt it (no passphrase ever leaves the browser). memlimit is capped at 1 GiB as a sanity
 * bound; opslimit is a small Argon2id iteration count.
 */
export const keyBackupSchema = z.object({
  v: z.number().int().min(1).max(10),
  salt: base64Blob,
  nonce: base64Blob,
  ciphertext: base64Blob,
  opslimit: z.number().int().min(1).max(100),
  memlimit: z
    .number()
    .int()
    .min(1)
    .max(1024 * 1024 * 1024),
});

/** SHA-256 hex digest (recovery-code lookup id). 64 lowercase hex chars. */
const sha256Hex = z
  .string()
  .trim()
  .length(64)
  .regex(/^[a-f0-9]+$/, "Must be a hex digest");

/**
 * A single-use recovery-code envelope (Sprint D.1): a sealed keypair like {@link keyBackupSchema}
 * plus the SHA-256 lookup id of its code. The server stores these opaquely and can never open them.
 */
export const recoveryCodeEnvelopeSchema = keyBackupSchema.extend({
  idHash: sha256Hex,
});

/**
 * PUT /api/keys/backup — store/replace the caller's account public key + encrypted backup, plus an
 * optional fresh set of single-use recovery-code envelopes (replaces any previous set atomically).
 */
export const uploadKeyBackupSchema = z.object({
  publicKey: base64Key,
  backup: keyBackupSchema,
  recoveryCodes: z.array(recoveryCodeEnvelopeSchema).max(20).optional(),
});

export type UploadKeyBackupInput = z.infer<typeof uploadKeyBackupSchema>;

/**
 * POST /api/keys/recover — redeem ONE single-use recovery code on a new device. The caller proves
 * phone ownership (the MSG91 access token, or a phone + dev OTP), and supplies the SHA-256 lookup id
 * of the code (never the raw code). The server returns the matching sealed envelope and burns it.
 */
export const redeemRecoveryCodeSchema = z
  .object({
    codeHash: sha256Hex,
    accessToken: z.string().trim().min(1).max(4000).optional(),
    phone: z.string().trim().regex(PHONE_E164_REGEX, "Enter a valid phone number").optional(),
    otp: z
      .string()
      .trim()
      .length(OTP_CODE_LENGTH, `Code must be ${OTP_CODE_LENGTH} digits`)
      .regex(/^\d+$/, "Code must be numeric")
      .optional(),
  })
  .refine((d) => Boolean(d.accessToken) || Boolean(d.phone && d.otp), {
    message: "Phone verification is required",
  });

export type RedeemRecoveryCodeInput = z.infer<typeof redeemRecoveryCodeSchema>;
