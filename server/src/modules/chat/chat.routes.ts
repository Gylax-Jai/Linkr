import { Router } from "express";
import {
  archiveChatSchema,
  chatIdParamSchema,
  createGroupSchema,
  createChatSchema,
  deleteMessageSchema,
  editMessageSchema,
  forwardMessageSchema,
  listMessagesQuerySchema,
  MEDIA_FILE_MAX_BYTES,
  messageIdParamSchema,
  muteChatSchema,
  pinChatSchema,
  postMessageBodySchema,
  reactMessageSchema,
  uploadMediaBodySchema,
} from "@linkr/shared";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { singleFileUpload } from "../../middleware/upload.js";
import {
  archiveChat,
  createChat,
  createGroupChat,
  deleteChat,
  getChats,
  getMedia,
  getMessages,
  markChatRead,
  muteChat,
  patchMessage,
  pinChat,
  postForward,
  postMedia,
  postMessage,
  reactMessage,
  removeMessage,
} from "./chat.controller.js";

/** In-memory multipart upload for media (Sprint 5); a hard byte cap is the first DoS defense. */
const uploadSingle = singleFileUpload("file", MEDIA_FILE_MAX_BYTES);

/**
 * Chat module (blueprint §10, §12): 1:1 chats and messages.
 * Sprint 4: reply / edit / delete / react + pin chats; friendship enforced on every route.
 */
export const chatRouter: Router = Router();

chatRouter.get("/", requireAuth, getChats);
chatRouter.post("/", requireAuth, validate(createChatSchema), createChat);
chatRouter.post("/group", requireAuth, validate(createGroupSchema), createGroupChat);

// Per-message actions (declared before /:chatId routes is unnecessary — paths don't collide).
chatRouter.patch(
  "/messages/:messageId",
  requireAuth,
  validate(messageIdParamSchema, "params"),
  validate(editMessageSchema),
  patchMessage,
);
chatRouter.delete(
  "/messages/:messageId",
  requireAuth,
  validate(messageIdParamSchema, "params"),
  validate(deleteMessageSchema),
  removeMessage,
);
chatRouter.post(
  "/messages/:messageId/react",
  requireAuth,
  validate(messageIdParamSchema, "params"),
  validate(reactMessageSchema),
  reactMessage,
);
chatRouter.post(
  "/messages/:messageId/forward",
  requireAuth,
  validate(messageIdParamSchema, "params"),
  validate(forwardMessageSchema),
  postForward,
);

// Authenticated media download for locally-stored files (re-checks chat membership).
chatRouter.get(
  "/media/:messageId",
  requireAuth,
  validate(messageIdParamSchema, "params"),
  getMedia,
);

chatRouter.get(
  "/:chatId/messages",
  requireAuth,
  validate(chatIdParamSchema, "params"),
  validate(listMessagesQuerySchema, "query"),
  getMessages,
);
chatRouter.post(
  "/:chatId/messages",
  requireAuth,
  validate(chatIdParamSchema, "params"),
  validate(postMessageBodySchema),
  postMessage,
);
chatRouter.patch(
  "/:chatId/pin",
  requireAuth,
  validate(chatIdParamSchema, "params"),
  validate(pinChatSchema),
  pinChat,
);
chatRouter.patch(
  "/:chatId/mute",
  requireAuth,
  validate(chatIdParamSchema, "params"),
  validate(muteChatSchema),
  muteChat,
);
chatRouter.patch(
  "/:chatId/read",
  requireAuth,
  validate(chatIdParamSchema, "params"),
  markChatRead,
);
chatRouter.patch(
  "/:chatId/archive",
  requireAuth,
  validate(chatIdParamSchema, "params"),
  validate(archiveChatSchema),
  archiveChat,
);
// Per-user delete (hide). Only membership is required — friendship is not needed to hide a chat.
// The single-segment `/:chatId` can't collide with the two-segment `/messages/:messageId` above.
chatRouter.delete(
  "/:chatId",
  requireAuth,
  validate(chatIdParamSchema, "params"),
  deleteChat,
);

// Media upload: validate params → parse multipart (multer) → validate caption → controller.
chatRouter.post(
  "/:chatId/media",
  requireAuth,
  validate(chatIdParamSchema, "params"),
  uploadSingle,
  validate(uploadMediaBodySchema),
  postMedia,
);
