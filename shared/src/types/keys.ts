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
