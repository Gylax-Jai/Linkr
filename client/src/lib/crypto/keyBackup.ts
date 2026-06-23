import type { KeyBackup, RecoveryCodeEnvelope } from "@linkr/shared";
import type { Sodium } from "./sodium";
import type { StoredKeypair } from "./storage";

/**
 * Account-key backup crypto (Sprint D — encryption on the account, not the device).
 *
 * Scheme: derive a 32-byte symmetric key from the user's recovery passphrase with Argon2id
 * (`crypto_pwhash`, memory-hard) over a random salt, then seal the JSON-encoded keypair with
 * `crypto_secretbox` (XSalsa20-Poly1305, authenticated). The salt/nonce and the exact Argon2id
 * limits travel inside the backup so any device can re-derive the identical key from the passphrase.
 *
 * The server stores only the resulting opaque blob. It never sees the passphrase or the derived key,
 * so it can never read the private key — confidentiality stays end-to-end while history follows the
 * account across devices.
 */

const BACKUP_VERSION = 1;

function b64(sodium: Sodium, bytes: Uint8Array): string {
  return sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL);
}

function fromB64(sodium: Sodium, value: string): Uint8Array {
  return sodium.from_base64(value, sodium.base64_variants.ORIGINAL);
}

/** Encrypt `keypair` under a key derived from `passphrase`. Returns the storable backup envelope. */
export function wrapKeypair(sodium: Sodium, keypair: StoredKeypair, passphrase: string): KeyBackup {
  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  const opslimit = sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE;
  const memlimit = sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE;

  const key = sodium.crypto_pwhash(
    sodium.crypto_secretbox_KEYBYTES,
    passphrase,
    salt,
    opslimit,
    memlimit,
    sodium.crypto_pwhash_ALG_DEFAULT,
  );

  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const message = sodium.from_string(JSON.stringify(keypair));
  const ciphertext = sodium.crypto_secretbox_easy(message, nonce, key);

  return {
    v: BACKUP_VERSION,
    salt: b64(sodium, salt),
    nonce: b64(sodium, nonce),
    ciphertext: b64(sodium, ciphertext),
    opslimit,
    memlimit,
  };
}

/**
 * Reverse `wrapKeypair`. Returns the keypair, or null on a wrong passphrase / malformed or tampered
 * blob (the AEAD tag fails to verify). Callers should surface a "wrong passphrase" message on null.
 */
export function unwrapKeypair(sodium: Sodium, backup: KeyBackup, passphrase: string): StoredKeypair | null {
  try {
    const key = sodium.crypto_pwhash(
      sodium.crypto_secretbox_KEYBYTES,
      passphrase,
      fromB64(sodium, backup.salt),
      backup.opslimit,
      backup.memlimit,
      sodium.crypto_pwhash_ALG_DEFAULT,
    );

    const opened = sodium.crypto_secretbox_open_easy(
      fromB64(sodium, backup.ciphertext),
      fromB64(sodium, backup.nonce),
      key,
    );

    const parsed = JSON.parse(sodium.to_string(opened)) as StoredKeypair;
    if (typeof parsed?.publicKey === "string" && typeof parsed?.privateKey === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/* ── Single-use recovery codes (Sprint D.1) ──────────────────────────────────────────────────────
 * A "forgot passphrase" fallback. At setup we mint N high-entropy codes and seal the keypair under
 * EACH (same Argon2id + secretbox scheme as the passphrase). The user saves the codes; the server
 * stores only the opaque envelopes keyed by a SHA-256 id. Redeeming one code on a new device returns
 * its envelope, which the raw code then opens locally. */

/** Number of single-use recovery codes generated at setup. */
export const RECOVERY_CODE_COUNT = 8;

/** Crockford base32 alphabet (no I/L/O/U → fewer transcription errors). 32 chars ⇒ no modulo bias. */
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** Characters per code (20 × 5 bits = 100 bits of entropy), shown grouped in 4s for readability. */
const CODE_LENGTH = 20;
const CODE_GROUP = 4;

/** Strip formatting and upper-case so a typed code matches the one we sealed/hashed at setup. */
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
}

/** SHA-256 hex of a normalized code — the server's opaque lookup id (never the code itself). */
export function recoveryCodeIdHash(sodium: Sodium, code: string): string {
  return sodium.to_hex(sodium.crypto_hash_sha256(sodium.from_string(normalizeRecoveryCode(code))));
}

/** Generate one random, dash-grouped recovery code (e.g. "AB3D-EFGH-JKMN-PQRS-TVWX"). */
function generateRecoveryCode(sodium: Sodium): string {
  const bytes = sodium.randombytes_buf(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    if (i > 0 && i % CODE_GROUP === 0) out += "-";
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return out;
}

/** Mint `count` recovery codes for display. The raw codes are returned ONCE and never stored. */
export function generateRecoveryCodes(sodium: Sodium, count: number = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => generateRecoveryCode(sodium));
}

/** Seal `keypair` under each recovery code, producing the opaque envelopes the server will store. */
export function wrapKeypairForCodes(
  sodium: Sodium,
  keypair: StoredKeypair,
  codes: string[],
): RecoveryCodeEnvelope[] {
  return codes.map((code) => {
    const normalized = normalizeRecoveryCode(code);
    return { ...wrapKeypair(sodium, keypair, normalized), idHash: recoveryCodeIdHash(sodium, normalized) };
  });
}
