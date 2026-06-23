import type { Request } from "express";
import type { NotificationIdParam } from "@linkr/shared";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  deleteAllNotifications,
  deleteOneNotification,
  getUnreadCount,
  listNotifications,
  markAllRead,
  markOneRead,
} from "./notifications.service.js";

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

/** GET /api/notifications — recent notifications for the user (newest first). */
export const getNotifications = asyncHandler(async (req, res) => {
  const notifications = await listNotifications(requireUserId(req));
  res.status(200).json({ notifications });
});

/** GET /api/notifications/unread-count — number of unread notifications. */
export const getUnread = asyncHandler(async (req, res) => {
  const count = await getUnreadCount(requireUserId(req));
  res.status(200).json({ count });
});

/** PATCH /api/notifications/read — mark all of the user's notifications read. */
export const readAll = asyncHandler(async (req, res) => {
  await markAllRead(requireUserId(req));
  res.status(200).json({ ok: true });
});

/** PATCH /api/notifications/:id/read — mark a single notification read (owner only). */
export const readOne = asyncHandler(async (req, res) => {
  const { id } = req.params as NotificationIdParam;
  await markOneRead(requireUserId(req), id);
  res.status(200).json({ ok: true });
});

/** DELETE /api/notifications — remove all of the user's notifications ("Clear all"). */
export const clearAll = asyncHandler(async (req, res) => {
  await deleteAllNotifications(requireUserId(req));
  res.status(200).json({ ok: true });
});

/** DELETE /api/notifications/:id — remove a single notification (owner only). */
export const removeOne = asyncHandler(async (req, res) => {
  const { id } = req.params as NotificationIdParam;
  await deleteOneNotification(requireUserId(req), id);
  res.status(200).json({ ok: true });
});
