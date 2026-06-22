import { UserModel } from "../../models/User.js";
import { ApiError } from "../../utils/ApiError.js";
import { areFriends } from "../friends/friendship.helpers.js";

/**
 * E2EE key service (Phase 2, blueprint §9). The server only ever stores/returns PUBLIC keys —
 * private keys live exclusively in the owner's browser (IndexedDB) and never touch the server.
 */

/** Publish (or rotate) the authenticated user's public key. Overwrites any previous key. */
export async function publishPublicKey(userId: string, publicKey: string): Promise<void> {
  const result = await UserModel.updateOne({ _id: userId }, { $set: { publicKey } });
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
