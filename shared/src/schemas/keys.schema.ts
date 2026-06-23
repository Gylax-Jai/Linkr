import { z } from "zod";

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

/** PUT /api/keys/backup — store/replace the caller's account public key + encrypted backup. */
export const uploadKeyBackupSchema = z.object({
  publicKey: base64Key,
  backup: keyBackupSchema,
});

export type UploadKeyBackupInput = z.infer<typeof uploadKeyBackupSchema>;
