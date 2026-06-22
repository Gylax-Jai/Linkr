import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { env } from "../config/env.js";
import { ApiError } from "./ApiError.js";

/**
 * Phone-number protection (blueprint §4): numbers are stored encrypted at rest (AES-256-GCM)
 * for retrieval, and an HMAC-SHA256 of the normalized E.164 number provides a stable,
 * non-reversible key for uniqueness/lookup ("ONE account per phone") without exposing the
 * plaintext. Keys are DERIVED from a secret — never hardcoded.
 */

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256-bit
const IV_LENGTH = 12; // 96-bit nonce, recommended for GCM
const BLOB_VERSION = "v1";

/** The master secret backing phone encryption; PHONE_ENC_KEY preferred, JWT secret as fallback. */
function masterSecret(): string {
  const secret = env.PHONE_ENC_KEY ?? env.JWT_ACCESS_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw ApiError.internal("Phone encryption is not configured (set PHONE_ENC_KEY or JWT_ACCESS_SECRET)");
  }
  return secret;
}

/** Derive a purpose-scoped 32-byte key from the master secret (scrypt, fixed per-purpose salt). */
function deriveKey(purpose: "enc" | "hmac"): Buffer {
  return scryptSync(masterSecret(), `linkr-phone-${purpose}`, KEY_LENGTH);
}

/** Encrypt an E.164 phone number into a self-describing base64 blob (version:iv:tag:ciphertext). */
export function encryptPhone(phone: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, deriveKey("enc"), iv);
  const ciphertext = Buffer.concat([cipher.update(phone, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    BLOB_VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/** Decrypt a blob produced by {@link encryptPhone} back to the original E.164 string. */
export function decryptPhone(blob: string): string {
  const parts = blob.split(":");
  if (parts.length !== 4 || parts[0] !== BLOB_VERSION) {
    throw ApiError.internal("Malformed encrypted phone payload");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(ALGORITHM, deriveKey("enc"), Buffer.from(ivB64!, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64!, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64!, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/**
 * Deterministic HMAC-SHA256 of a normalized E.164 phone. Used as a sparse-unique index value
 * so the same number always maps to the same hash (uniqueness) while remaining non-reversible.
 */
export function hashPhone(phone: string): string {
  return createHmac("sha256", deriveKey("hmac")).update(phone).digest("hex");
}
