import { Router } from "express";
import {
  archiveChatSchema,
  chatIdParamSchema,
  createGroupSchema,
  createChatSchema,
  createPollSchema,
  deleteMessageSchema,
  editMessageSchema,
  forwardMessageSchema,
  groupMemberParamSchema,
  addGroupMemberSchema,
  leaveGroupSchema,
  listMessagesQuerySchema,
  MEDIA_FILE_MAX_BYTES,
  AVATAR_MAX_BYTES,
  messageIdParamSchema,
  muteChatSchema,
  pinChatSchema,
  postMessageBodySchema,
  reactMessageSchema,
  updateGroupSchema,
  updateGroupPermissionsSchema,
  uploadMediaBodySchema,
  votePollSchema,
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
  postPoll,
  reactMessage,
  removeMessage,
  votePollMessage,
} from "./chat.controller.js";
import {
  deleteGroupAdmin,
  deleteGroupMember,
  getGroupAvatar,
  getGroupMembers,
  patchGroup,
  patchGroupPermissions,
  postGroupAdmin,
  postGroupAvatar,
  postGroupMember,
  postLeaveGroup,
} from "./group.controller.js";

/** In-memory multipart upload for media (Sprint 5); a hard byte cap is the first DoS defense. */
const uploadSingle = singleFileUpload("file", MEDIA_FILE_MAX_BYTES);
const uploadAvatar = singleFileUpload("file", AVATAR_MAX_BYTES);

/**
 * Chat module (blueprint §10, §12): 1:1 chats and messages.
 * Sprint 4: reply / edit / delete / react + pin chats; friendship enforced on every route.
 */
export const chatRouter: Router = Router();

chatRouter.get("/", requireAuth, getChats);
chatRouter.post("/", requireAuth, validate(createChatSchema), createChat);
chatRouter.post("/group", requireAuth, validate(createGroupSchema), createGroupChat);

chatRouter.get(
  "/group/:chatId/members",
  requireAuth,
  validate(chatIdParamSchema, "params"),
  getGroupMembers,
);

chatRouter.patch(
  "/group/:chatId",
  requireAuth,
  validate(chatIdParamSchema, "params"),
  validate(updateGroupSchema),
  patchGroup,
);
chatRouter.patch(
  "/group/:chatId/permissions",
  requireAuth,
  validate(chatIdParamSchema, "params"),
  validate(updateGroupPermissionsSchema),
  patchGroupPermissions,
);
chatRouter.post(
  "/group/:chatId/avatar",
  requireAuth,
  validate(chatIdParamSchema, "params"),
  uploadAvatar,
  postGroupAvatar,
);
chatRouter.get(
  "/group/:chatId/avatar",
  requireAuth,
  validate(chatIdParamSchema, "params"),
  getGroupAvatar,
);
chatRouter.post(
  "/group/:chatId/members",
  requireAuth,
  validate(chatIdParamSchema, "params"),
  validate(addGroupMemberSchema),
  postGroupMember,
);
chatRouter.delete(
  "/group/:chatId/members/:userId",
  requireAuth,
  validate(groupMemberParamSchema, "params"),
  deleteGroupMember,
);
chatRouter.post(
  "/group/:chatId/admins/:userId",
  requireAuth,
  validate(groupMemberParamSchema, "params"),
  postGroupAdmin,
);
chatRouter.delete(
  "/group/:chatId/admins/:userId",
  requireAuth,
  validate(groupMemberParamSchema, "params"),
  deleteGroupAdmin,
);
chatRouter.post(
  "/group/:chatId/leave",
  requireAuth,
  validate(chatIdParamSchema, "params"),
  validate(leaveGroupSchema),
  postLeaveGroup,
);

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
  "/messages/:messageId/vote",
  requireAuth,
  validate(messageIdParamSchema, "params"),
  validate(votePollSchema),
  votePollMessage,
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
  "/:chatId/poll",
  requireAuth,
  validate(chatIdParamSchema, "params"),
  validate(createPollSchema),
  postPoll,
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
