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

/**
 * One single-use recovery-code envelope (Sprint D.1). Same sealed-keypair shape as {@link KeyBackup},
 * but unlocked by a high-entropy backup CODE instead of the passphrase. `idHash` is the SHA-256 hex
 * of the raw code — a server-side lookup id that lets us return + burn the right envelope WITHOUT
 * ever seeing the code (the code, like the passphrase, never leaves the browser in usable form).
 */
export interface RecoveryCodeEnvelope extends KeyBackup {
  /** SHA-256 hex of the raw recovery code; the server's opaque lookup id (never the code itself). */
  idHash: string;
}

/** Response for GET /api/keys/backup — the caller's own encrypted key backup, if any. */
export interface KeyBackupResponse {
  hasBackup: boolean;
  backup: KeyBackup | null;
  /** The account public key the backup unlocks to (lets a device detect a stale local key). */
  publicKey: string | null;
  /** How many unused single-use recovery codes remain (drives the "use a backup code" option). */
  recoveryCodesRemaining: number;
  /** Masked verified phone (e.g. "•••• 3210") so the user recognizes which number unlocks codes. */
  phoneHint: string | null;
}

/** Response for POST /api/keys/recover — the sealed keypair envelope a redeemed code decrypts. */
export interface RecoverResponse {
  /** The sealed keypair to open with the raw recovery code (client-side only). */
  envelope: KeyBackup;
  /** The account public key the envelope unlocks to. */
  publicKey: string | null;
}
