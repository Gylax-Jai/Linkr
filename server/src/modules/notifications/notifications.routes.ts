import { Router } from "express";
import { notificationIdParamSchema } from "@linkr/shared";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  clearAll,
  getNotifications,
  getUnread,
  readAll,
  readOne,
  removeOne,
} from "./notifications.controller.js";

/**
 * Notifications module (Sprint 5): list + unread count + mark-read. All routes require auth and
 * every query is scoped to the authenticated user inside the service.
 */
export const notificationsRouter: Router = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get("/", getNotifications);
notificationsRouter.get("/unread-count", getUnread);
notificationsRouter.patch("/read", readAll);
notificationsRouter.patch("/:id/read", validate(notificationIdParamSchema, "params"), readOne);
notificationsRouter.delete("/", clearAll);
notificationsRouter.delete("/:id", validate(notificationIdParamSchema, "params"), removeOne);
