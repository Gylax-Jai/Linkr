import type { KeyBackup, KeyBackupResponse } from "@linkr/shared";
import { UserModel } from "../../models/User.js";
import { ApiError } from "../../utils/ApiError.js";
import { areFriends } from "../friends/friendship.helpers.js";

/**
 * E2EE key service (Phase 2 + Sprint D). The server only ever stores/returns PUBLIC keys and an
 * OPAQUE, client-encrypted key backup — private keys (and the recovery passphrase that protects the
 * backup) live exclusively in the owner's browser and never touch the server in readable form.
 */

/**
 * Publish (or rotate) the authenticated user's public key. When the key actually CHANGES (a key
 * reset on a new device, or losing the recovery passphrase), the stored account key backup is
 * cleared too — it encrypts the OLD private key, so it would no longer match. The owner is then
 * re-prompted to set a fresh recovery passphrase. Re-publishing the same key leaves the backup intact.
 */
export async function publishPublicKey(userId: string, publicKey: string): Promise<void> {
  const user = await UserModel.findById(userId).select("publicKey");
  if (!user) throw ApiError.notFound("User not found");

  const changed = user.publicKey !== publicKey;
  const update: Record<string, unknown> = { $set: { publicKey } };
  if (changed) update.$unset = { keyBackup: 1 };
  await UserModel.updateOne({ _id: userId }, update);
}

/** Fetch the caller's own encrypted account-key backup (+ the public key it unlocks to). */
export async function getKeyBackup(userId: string): Promise<KeyBackupResponse> {
  const user = await UserModel.findById(userId).select("+keyBackup publicKey");
  if (!user) throw ApiError.notFound("User not found");

  const b = user.keyBackup;
  const hasBackup = Boolean(b && typeof b.ciphertext === "string" && b.ciphertext.length > 0);
  const backup: KeyBackup | null =
    hasBackup && b
      ? {
          v: Number(b.v),
          salt: String(b.salt),
          nonce: String(b.nonce),
          ciphertext: String(b.ciphertext),
          opslimit: Number(b.opslimit),
          memlimit: Number(b.memlimit),
        }
      : null;

  return {
    hasBackup,
    backup,
    publicKey: typeof user.publicKey === "string" && user.publicKey.length > 0 ? user.publicKey : null,
  };
}

/**
 * Store/replace the caller's account public key + encrypted key backup together (atomic), so the
 * stored public key always matches the keypair inside the backup. The blob is opaque to the server.
 */
export async function saveKeyBackup(userId: string, publicKey: string, backup: KeyBackup): Promise<void> {
  const result = await UserModel.updateOne({ _id: userId }, { $set: { publicKey, keyBackup: backup } });
  if (result.matchedCount === 0) {
    throw ApiError.notFound("User not found");
  }
}

/**
 * Fetch a user's public key. Readable only for yourself or an accepted friend — you can only ever
 * message friends, so this mirrors that boundary and avoids key enumeration by strangers. Returns
 * null when the target user has not published a key yet (e.g. the dev bot, which has no browser).
 */
export async function getPublicKey(requesterId: string, targetId: string): Promise<string | null> {
  if (requesterId !== targetId && !(await areFriends(requesterId, targetId))) {
    throw ApiError.forbidden("NOT_FRIENDS", "You can only fetch keys for yourself or friends");
  }
  const user = await UserModel.findById(targetId).select("publicKey");
  if (!user) throw ApiError.notFound("User not found");
  return typeof user.publicKey === "string" && user.publicKey.length > 0 ? user.publicKey : null;
}
