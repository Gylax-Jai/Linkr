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
