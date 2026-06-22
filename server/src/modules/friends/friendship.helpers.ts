import type { HydratedDocument } from "mongoose";
import { FriendshipModel } from "../../models/Friendship.js";
import type { FriendshipDoc } from "../../models/Friendship.js";

type FriendshipDocument = HydratedDocument<FriendshipDoc>;

/** Bidirectional lookup for a relationship between two users. */
export async function findFriendshipBetween(
  userA: string,
  userB: string,
): Promise<FriendshipDocument | null> {
  return FriendshipModel.findOne({
    $or: [
      { requester: userA, recipient: userB },
      { requester: userB, recipient: userA },
    ],
  });
}

/** Returns true only when an accepted friendship exists between the two users. */
export async function areFriends(userA: string, userB: string): Promise<boolean> {
  const doc = await findFriendshipBetween(userA, userB);
  return doc?.status === "accepted";
}

/** Whether either party has blocked the other. */
export async function isBlocked(userA: string, userB: string): Promise<boolean> {
  const doc = await findFriendshipBetween(userA, userB);
  return doc?.status === "blocked";
}
