import type { KeyBackup } from "@linkr/shared";
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
