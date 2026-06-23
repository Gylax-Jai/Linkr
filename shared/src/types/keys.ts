import type { ID } from "./common.js";

/**
 * E2EE key exchange DTOs (Phase 2, blueprint §9). Public keys are safe to share; private keys
 * stay in the owner's browser (IndexedDB) and are never sent to the server.
 */

/** Response for GET /api/keys/:userId — the user's current X25519 public key (base64) or null. */
export interface PublicKeyResponse {
  userId: ID;
  /** base64 X25519 public key, or null when the user has not published one (e.g. the dev bot). */
  publicKey: string | null;
}

/**
 * Account-level E2EE key backup (Sprint D — encryption on the account, not the device). The owner's
 * X25519 keypair is encrypted CLIENT-SIDE with a key derived from their recovery passphrase
 * (Argon2id via libsodium `crypto_pwhash`) and sealed with `crypto_secretbox` (XSalsa20-Poly1305).
 * The server stores this blob verbatim and can NEVER read it — it never sees the passphrase or the
 * derived key. Restoring it on another device (with the passphrase) gives that device the same
 * account keypair, so all message history decrypts there too.
 */
export interface KeyBackup {
  /** Backup format version. */
  v: number;
  /** base64 Argon2id salt. */
  salt: string;
  /** base64 secretbox nonce. */
  nonce: string;
  /** base64 secretbox ciphertext of the JSON-encoded keypair. */
  ciphertext: string;
  /** Argon2id ops limit used (stored so unlock derives the identical key). */
  opslimit: number;
  /** Argon2id memory limit (bytes) used. */
  memlimit: number;
}

/** Response for GET /api/keys/backup — the caller's own encrypted key backup, if any. */
export interface KeyBackupResponse {
  hasBackup: boolean;
  backup: KeyBackup | null;
  /** The account public key the backup unlocks to (lets a device detect a stale local key). */
  publicKey: string | null;
}
