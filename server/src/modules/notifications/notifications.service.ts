import type { HydratedDocument } from "mongoose";
import type { NotificationDTO, NotificationType, PublicUser } from "@linkr/shared";
import { NOTIFICATION_LIST_LIMIT, SOCKET_EVENTS } from "@linkr/shared";
import { NotificationModel, type NotificationDoc } from "../../models/Notification.js";
import { getSocketServer } from "../../sockets/io.js";
import { isMongoConnected } from "../../config/db.js";
import { logger } from "../../utils/logger.js";
import { resolveAvatarUrl } from "../users/avatar.helpers.js";

/**
 * In-app notifications (Sprint 5). Persists per-recipient notifications and pushes them live
 * over the `notification:new` socket event. Previews are short, plaintext snippets — full
 * message bodies are never stored here or logged.
 */

type NotificationDocument = HydratedDocument<NotificationDoc>;

const ACTOR_POPULATE = { path: "actor", select: "username displayName avatar" } as const;

/** Build a small public-user shape from a populated `actor` (undefined if not populated). */
function toPublicUser(actor: unknown): PublicUser | undefined {
  if (!actor || typeof actor !== "object" || !("displayName" in actor)) return undefined;
  const a = actor as {
    _id: { toString(): string };
    username?: string | null;
    displayName: string;
    avatar?: string | null;
  };
  return {
    _id: a._id.toString(),
    username: a.username ?? undefined,
    displayName: a.displayName,
    avatar: resolveAvatarUrl(a.avatar, a._id.toString()),
  };
}

function toNotificationDTO(doc: NotificationDocument): NotificationDTO {
  return {
    _id: doc._id.toString(),
    type: doc.type as NotificationType,
    actor: toPublicUser(doc.actor),
    chatId: doc.chatId ? doc.chatId.toString() : undefined,
    friendshipId: doc.friendshipId ? doc.friendshipId.toString() : undefined,
    messagePreview: doc.messagePreview ?? undefined,
    read: Boolean(doc.read),
    createdAt: (doc.createdAt instanceof Date ? doc.createdAt : new Date()).toISOString(),
  };
}

interface CreateNotificationParams {
  /** Recipient user id. */
  userId: string;
  type: NotificationType;
  /** User who triggered the notification (never notify yourself). */
  actorId?: string;
  chatId?: string;
  /** Friendship referenced by a friend_request notification (for inline accept/reject). */
  friendshipId?: string;
  messagePreview?: string;
}

/**
 * Persist a notification AND emit it live to the recipient. Best-effort: never throws (so it
 * cannot break the friend/message flow it hooks into) and no-ops when Mongo is unavailable.
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  const { userId, type, actorId, chatId, friendshipId, messagePreview } = params;
  if (!isMongoConnected()) return;
  if (actorId && actorId === userId) return; // never notify the actor about their own action

  try {
    const doc = (await NotificationModel.create({
      user: userId,
      type,
      ...(actorId ? { actor: actorId } : {}),
      ...(chatId ? { chatId } : {}),
      ...(friendshipId ? { friendshipId } : {}),
      ...(messagePreview ? { messagePreview } : {}),
    })) as NotificationDocument;

    await doc.populate(ACTOR_POPULATE);

    const io = getSocketServer();
    io?.to(`user:${userId}`).emit(SOCKET_EVENTS.NOTIFICATION_NEW, {
      notification: toNotificationDTO(doc),
    });
  } catch (err) {
    logger.warn("Failed to create notification", {
      type,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Recent notifications for a user, newest first (capped). */
export async function listNotifications(userId: string): Promise<NotificationDTO[]> {
  const docs = await NotificationModel.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(NOTIFICATION_LIST_LIMIT)
    .populate(ACTOR_POPULATE);
  return docs.map((d) => toNotificationDTO(d as NotificationDocument));
}

export async function getUnreadCount(userId: string): Promise<number> {
  return NotificationModel.countDocuments({ user: userId, read: false });
}

export async function markAllRead(userId: string): Promise<void> {
  await NotificationModel.updateMany({ user: userId, read: false }, { $set: { read: true } });
}

/** Mark a single notification read — scoped to the owner so users can't touch others' rows. */
export async function markOneRead(userId: string, id: string): Promise<void> {
  await NotificationModel.updateOne({ _id: id, user: userId }, { $set: { read: true } });
}
