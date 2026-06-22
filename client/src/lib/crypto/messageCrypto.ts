import type { Sodium } from "./sodium";
import type { StoredKeypair } from "./storage";

/**
 * E2EE message envelope (Phase 2, blueprint §9). Text-only for now.
 *
 * Scheme: a per-message anonymous sealed box (`crypto_box_seal`) of the UTF-8 plaintext to EACH
 * chat member's X25519 public key. The envelope carries one sealed copy per member keyed by userId,
 * so every member (including the sender) can open their own copy with their private key. The server
 * stores the JSON envelope verbatim and can never read it.
 *
 * Confidentiality is end-to-end. Sender authenticity is provided by the transport layer (the server
 * authenticates the socket/JWT and stamps `sender`), not by the sealed box itself — documented so we
 * never over-claim. For 1:1 this means two sealed copies; the format extends to small groups as-is.
 */

const ENVELOPE_VERSION = 1;
const ALG = "sealedbox" as const;

interface Envelope {
  v: number;
  alg: typeof ALG;
  /** userId -> base64 sealed box of the plaintext for that member. */
  k: Record<string, string>;
}

function b64(sodium: Sodium, bytes: Uint8Array): string {
  return sodium.to_base64(bytes, sodium.base64_variants.ORIGINAL);
}

function fromB64(sodium: Sodium, value: string): Uint8Array {
  return sodium.from_base64(value, sodium.base64_variants.ORIGINAL);
}

/** A chat member we can encrypt to: their userId + base64 X25519 public key. */
export interface Recipient {
  userId: string;
  publicKey: string;
}

/**
 * Build an encrypted envelope of `plaintext` for every recipient (the caller must include the
 * sender so they can read their own message back). Returns the JSON string to store as `content`.
 */
export function encryptEnvelope(sodium: Sodium, plaintext: string, recipients: Recipient[]): string {
  const message = sodium.from_string(plaintext);
  const k: Record<string, string> = {};
  for (const recipient of recipients) {
    const sealed = sodium.crypto_box_seal(message, fromB64(sodium, recipient.publicKey));
    k[recipient.userId] = b64(sodium, sealed);
  }
  const envelope: Envelope = { v: ENVELOPE_VERSION, alg: ALG, k };
  return JSON.stringify(envelope);
}

/**
 * Open an encrypted envelope as `myUserId` using my keypair. Returns the plaintext, or null when
 * the envelope has no copy for me / is malformed / fails to open (e.g. it was sealed to an older
 * public key I no longer hold). Callers should render a "can't decrypt" placeholder on null.
 */
export function decryptEnvelope(
  sodium: Sodium,
  content: string,
  myUserId: string,
  keypair: StoredKeypair,
): string | null {
  let envelope: Envelope;
  try {
    envelope = JSON.parse(content) as Envelope;
  } catch {
    return null;
  }
  if (!envelope || envelope.alg !== ALG || typeof envelope.k !== "object") return null;

  const sealedB64 = envelope.k[myUserId];
  if (typeof sealedB64 !== "string") return null;

  try {
    const opened = sodium.crypto_box_seal_open(
      fromB64(sodium, sealedB64),
      fromB64(sodium, keypair.publicKey),
      fromB64(sodium, keypair.privateKey),
    );
    return sodium.to_string(opened);
  } catch {
    return null;
  }
}
