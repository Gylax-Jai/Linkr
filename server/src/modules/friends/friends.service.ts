import type { HydratedDocument } from "mongoose";
import type {
  Friendship,
  FriendshipListItem,
  FriendshipDirection,
  FriendRequestResponse,
  FriendsListResponse,
  PendingRequestsResponse,
  PublicUser,
} from "@linkr/shared";
import { SOCKET_EVENTS } from "@linkr/shared";
import { FriendshipModel, type FriendshipDoc } from "../../models/Friendship.js";
import { UserModel } from "../../models/User.js";
import { ApiError } from "../../utils/ApiError.js";
import type { UserDocument } from "../auth/auth.service.js";
import { getSocketServer } from "../../sockets/io.js";
import { maybeAutoAcceptFriendRequest } from "../bot/bot.service.js";
import { getOrCreateDirectChat } from "../chat/chat.service.js";
import { createNotification } from "../notifications/notifications.service.js";
import { resolveAvatarUrl } from "../users/avatar.helpers.js";
import { logger } from "../../utils/logger.js";
import { findFriendshipBetween } from "./friendship.helpers.js";

/** Friends service: requests, accept/reject/cancel, block, and list operations (blueprint §5). */

type FriendshipDocument = HydratedDocument<FriendshipDoc>;

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

function toPublicUser(doc: {
  _id: { toString(): string };
  username?: string | null;
  displayName: string;
  avatar?: string | null;
}): PublicUser {
  return {
    _id: doc._id.toString(),
    username: doc.username ?? undefined,
    displayName: doc.displayName,
    avatar: resolveAvatarUrl(doc.avatar, doc._id.toString()),
  };
}

function toFriendship(doc: FriendshipDocument): Friendship {
  return {
    _id: doc._id.toString(),
    requester: doc.requester.toString(),
    recipient: doc.recipient.toString(),
    status: doc.status,
    actionBy: doc.actionBy.toString(),
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}

function directionFor(viewerId: string, requesterId: string): FriendshipDirection {
  return requesterId === viewerId ? "outgoing" : "incoming";
}

async function loadOtherUser(
  viewerId: string,
  requesterId: string,
  recipientId: string,
): Promise<{ user: PublicUser; online: boolean } | null> {
  const otherId = requesterId === viewerId ? recipientId : requesterId;
  const user = await UserModel.findById(otherId).select("_id username displayName avatar online");
  if (!user) return null;
  return { user: toPublicUser(user), online: Boolean(user.online) };
}

async function toListItem(viewerId: string, doc: FriendshipDocument): Promise<FriendshipListItem | null> {
  const requesterId = doc.requester.toString();
  const recipientId = doc.recipient.toString();
  const loaded = await loadOtherUser(viewerId, requesterId, recipientId);
  if (!loaded) return null;

  return {
    friendshipId: doc._id.toString(),
    status: doc.status,
    direction: directionFor(viewerId, requesterId),
    user: loaded.user,
    online: loaded.online,
    createdAt: (doc.createdAt ?? new Date()).toISOString(),
    updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
  };
}

function emitToUser(userId: string, event: string, payload: unknown): void {
  const io = getSocketServer();
  if (!io) return;
  io.to(`user:${userId}`).emit(event, payload);
}

/**
 * If the recipient is the test bot, accept the pending request immediately so the POST
 * response already reflects friendship (no waiting on the socket event).
 */
async function resolveWithBotAutoAccept(
  friendship: Friendship,
  recipientId: string,
  requesterId: string,
): Promise<FriendRequestResponse> {
  const accepted = await maybeAutoAcceptFriendRequest(friendship._id, recipientId, requesterId);
  if (!accepted) return { friendship };
  const fresh = await FriendshipModel.findById(friendship._id);
  return { friendship: fresh ? toFriendship(fresh) : { ...friendship, status: "accepted" } };
}

export async function sendFriendRequest(
  requester: UserDocument,
  recipientId: string,
): Promise<FriendRequestResponse> {
  if (requester.id === recipientId) {
    throw ApiError.badRequest("You cannot send a friend request to yourself");
  }

  const recipient = await UserModel.findById(recipientId);
  if (!recipient || !recipient.onboarded) {
    throw ApiError.notFound("User not found");
  }

  if (recipient.privacy?.whoCanRequest === "nobody") {
    throw ApiError.forbidden("REQUESTS_DISABLED", "This user is not accepting friend requests");
  }

  const existing = await findFriendshipBetween(requester.id, recipientId);
  if (existing) {
    if (existing.status === "accepted") {
      throw new ApiError(409, "ALREADY_FRIENDS", "You are already friends");
    }
    if (existing.status === "blocked") {
      throw ApiError.forbidden("BLOCKED", "You cannot send a friend request to this user");
    }
    if (existing.status === "pending") {
      if (existing.requester.toString() === requester.id) {
        throw new ApiError(409, "REQUEST_PENDING", "Friend request already sent");
      }
      throw new ApiError(409, "REQUEST_PENDING", "This user already sent you a request — accept it instead");
    }
    existing.set({
      status: "pending",
      requester: requester._id,
      recipient: recipient._id,
      actionBy: requester._id,
    });
    await existing.save();
    const friendship = toFriendship(existing);
    emitToUser(recipientId, SOCKET_EVENTS.FRIEND_REQUEST, { friendship, from: toPublicUser(requester) });
    void createNotification({
      userId: recipientId,
      type: "friend_request",
      actorId: requester.id,
      friendshipId: friendship._id,
    });
    return resolveWithBotAutoAccept(friendship, recipientId, requester.id);
  }

  try {
    const doc = await FriendshipModel.create({
      requester: requester._id,
      recipient: recipient._id,
      status: "pending",
      actionBy: requester._id,
    });
    const friendship = toFriendship(doc);
    emitToUser(recipientId, SOCKET_EVENTS.FRIEND_REQUEST, { friendship, from: toPublicUser(requester) });
    void createNotification({
      userId: recipientId,
      type: "friend_request",
      actorId: requester.id,
      friendshipId: friendship._id,
    });
    return resolveWithBotAutoAccept(friendship, recipientId, requester.id);
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new ApiError(409, "REQUEST_PENDING", "Friend request already exists");
    }
    throw err;
  }
}

async function requireFriendshipForActor(
  actorId: string,
  friendshipId: string,
  allowedStatuses: Friendship["status"][],
): Promise<{ doc: FriendshipDocument; otherUserId: string }> {
  const doc = await FriendshipModel.findById(friendshipId);
  if (!doc) {
    throw ApiError.notFound("Friendship not found");
  }

  const requesterId = doc.requester.toString();
  const recipientId = doc.recipient.toString();
  if (actorId !== requesterId && actorId !== recipientId) {
    throw ApiError.forbidden("FORBIDDEN", "You are not part of this friendship");
  }

  if (!allowedStatuses.includes(doc.status)) {
    throw ApiError.badRequest("Invalid friendship state for this action");
  }

  const otherUserId = actorId === requesterId ? recipientId : requesterId;
  return { doc, otherUserId };
}

export async function acceptFriendRequest(actorId: string, friendshipId: string): Promise<FriendRequestResponse> {
  const { doc, otherUserId } = await requireFriendshipForActor(actorId, friendshipId, ["pending"]);
  if (doc.recipient.toString() !== actorId) {
    throw ApiError.forbidden("FORBIDDEN", "Only the recipient can accept a friend request");
  }

  doc.status = "accepted";
  doc.actionBy = doc.recipient;
  await doc.save();

  // Materialize the 1:1 chat immediately so it appears in BOTH users' sidebars right after the
  // request is accepted (previously a chat only existed once someone hit "Message"). Best-effort:
  // the friendship is the source of truth, so a chat-creation hiccup must not fail the accept.
  try {
    await getOrCreateDirectChat(actorId, otherUserId);
  } catch (err) {
    logger.warn("Failed to auto-create chat on friend accept", { err, actorId, otherUserId });
  }

  const friendship = toFriendship(doc);
  const actor = await UserModel.findById(actorId).select("_id username displayName avatar");
  emitToUser(otherUserId, SOCKET_EVENTS.FRIEND_ACCEPTED, {
    friendship,
    from: actor ? toPublicUser(actor) : undefined,
  });
  void createNotification({ userId: otherUserId, type: "friend_accepted", actorId });
  return { friendship };
}

export async function rejectFriendRequest(actorId: string, friendshipId: string): Promise<FriendRequestResponse> {
  const { doc, otherUserId } = await requireFriendshipForActor(actorId, friendshipId, ["pending"]);
  if (doc.recipient.toString() !== actorId) {
    throw ApiError.forbidden("FORBIDDEN", "Only the recipient can reject a friend request");
  }

  doc.status = "rejected";
  doc.actionBy = doc.recipient;
  await doc.save();

  const friendship = toFriendship(doc);
  emitToUser(otherUserId, SOCKET_EVENTS.FRIEND_REJECTED, { friendship });
  return { friendship };
}

export async function cancelFriendRequest(actorId: string, friendshipId: string): Promise<void> {
  const { doc } = await requireFriendshipForActor(actorId, friendshipId, ["pending"]);
  if (doc.requester.toString() !== actorId) {
    throw ApiError.forbidden("FORBIDDEN", "Only the requester can cancel a pending request");
  }
  await doc.deleteOne();
}

export async function blockUser(actorId: string, targetUserId: string): Promise<FriendRequestResponse> {
  if (actorId === targetUserId) {
    throw ApiError.badRequest("You cannot block yourself");
  }

  const target = await UserModel.findById(targetUserId);
  if (!target) {
    throw ApiError.notFound("User not found");
  }

  const existing = await findFriendshipBetween(actorId, targetUserId);
  if (existing) {
    existing.status = "blocked";
    existing.actionBy = actorId as unknown as typeof existing.actionBy;
    await existing.save();
    return { friendship: toFriendship(existing) };
  }

  const doc = await FriendshipModel.create({
    requester: actorId,
    recipient: targetUserId,
    status: "blocked",
    actionBy: actorId,
  });
  return { friendship: toFriendship(doc) };
}

/**
 * Remove a block the actor placed. Only the blocker (the one who set `blocked`) may clear it, and
 * only when the relationship is currently blocked. The friendship row is deleted entirely, so the
 * two users return to being strangers — unblocking never silently recreates a friendship.
 */
export async function unblockUser(actorId: string, targetUserId: string): Promise<{ ok: true }> {
  if (actorId === targetUserId) {
    throw ApiError.badRequest("You cannot unblock yourself");
  }

  const existing = await findFriendshipBetween(actorId, targetUserId);
  if (!existing || existing.status !== "blocked") {
    throw ApiError.badRequest("This user is not blocked");
  }
  if (existing.actionBy.toString() !== actorId) {
    throw ApiError.forbidden("FORBIDDEN", "You can only remove a block you placed");
  }

  await existing.deleteOne();
  return { ok: true };
}

/**
 * Remove an accepted friendship (unfriend). Requires the two users to currently be friends, then
 * deletes the friendship row so both return to being strangers — messaging is then gated off by the
 * friendship check on every chat route/socket (we never set `blocked`). The other user is notified
 * live (mirrors how FRIEND_REJECTED is emitted) so their UI updates without a refresh.
 */
export async function removeFriend(actorId: string, targetUserId: string): Promise<{ ok: true }> {
  if (actorId === targetUserId) {
    throw ApiError.badRequest("You cannot unfriend yourself");
  }

  const existing = await findFriendshipBetween(actorId, targetUserId);
  if (!existing || existing.status !== "accepted") {
    throw ApiError.badRequest("You are not friends with this user");
  }

  await existing.deleteOne();
  emitToUser(targetUserId, SOCKET_EVENTS.FRIEND_REMOVED, { userId: actorId });
  return { ok: true };
}

export async function listFriends(actorId: string): Promise<FriendsListResponse> {
  const docs = await FriendshipModel.find({
    status: "accepted",
    $or: [{ requester: actorId }, { recipient: actorId }],
  }).sort({ updatedAt: -1 });

  const friends: FriendshipListItem[] = [];
  for (const doc of docs) {
    const item = await toListItem(actorId, doc);
    if (item) friends.push(item);
  }
  return { friends };
}

export async function listPendingRequests(actorId: string): Promise<PendingRequestsResponse> {
  const docs = await FriendshipModel.find({
    status: "pending",
    $or: [{ requester: actorId }, { recipient: actorId }],
  }).sort({ createdAt: -1 });

  const incoming: FriendshipListItem[] = [];
  const outgoing: FriendshipListItem[] = [];
  for (const doc of docs) {
    const item = await toListItem(actorId, doc);
    if (!item) continue;
    if (item.direction === "incoming") incoming.push(item);
    else outgoing.push(item);
  }
  return { incoming, outgoing };
}
