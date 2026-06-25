import { z } from "zod";
import {
  GROUP_MESSAGE_PERMISSION_VALUES,
  MEDIA_CAPTION_MAX,
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_TEXT_MAX,
  POLL_QUESTION_MAX,
} from "../constants/limits.js";

export const createGroupSchema = z.object({
  /** Display name for the group (Phase 6). */
  name: z.string().trim().min(1).max(50),
  /** Friend user ids to add (excluding yourself). At least one required; total members capped at 16. */
  memberIds: z.array(z.string().min(1)).min(1).max(15),
});

/** PATCH /api/chat/group/:chatId — rename a group (admin only). */
export const updateGroupSchema = z.object({
  name: z.string().trim().min(1).max(50),
});

/** PATCH /api/chat/group/:chatId/permissions — who may send messages (admin only). */
export const updateGroupPermissionsSchema = z.object({
  messagePermission: z.enum(GROUP_MESSAGE_PERMISSION_VALUES),
});

/** POST /api/chat/group/:chatId/members — add a friend to the group (admin only). */
export const addGroupMemberSchema = z.object({
  userId: z.string().min(1),
});

/** POST /api/chat/group/:chatId/leave — sole admin may pass a successor before leaving. */
export const leaveGroupSchema = z.object({
  newAdminId: z.string().min(1).optional(),
});

export const groupMemberParamSchema = z.object({
  chatId: z.string().min(1),
  userId: z.string().min(1),
});

export const createChatSchema = z.object({
  /** Friend's user id — server creates or returns the existing 1:1 chat. */
  participantId: z.string().min(1),
});

export const chatIdParamSchema = z.object({
  chatId: z.string().min(1),
});

/**
 * Upper bound for a message body. Plaintext is limited to ~8 000 chars in the UI, but an
 * end-to-end-encrypted envelope (Phase 2) is a base64 JSON blob that wraps the plaintext once per
 * chat member, so the stored `content` can be several times larger — hence the higher cap here.
 */
const CONTENT_MAX = 200_000;

export const sendMessageSchema = z.object({
  chatId: z.string().min(1),
  content: z.string().trim().min(1).max(CONTENT_MAX),
  type: z.enum(["text"]).default("text"),
  /** True when `content` is an E2EE envelope (Phase 2); the server stores it without reading it. */
  encrypted: z.boolean().optional(),
  /** Optional id of the message being replied to. */
  replyTo: z.string().min(1).optional(),
});

export const postMessageBodySchema = z.object({
  content: z.string().trim().min(1).max(CONTENT_MAX),
  type: z.enum(["text"]).default("text"),
  encrypted: z.boolean().optional(),
  replyTo: z.string().min(1).optional(),
});

export const listMessagesQuerySchema = z.object({
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** Route param: a single message id. */
export const messageIdParamSchema = z.object({
  messageId: z.string().min(1),
});

/** PATCH /api/chat/messages/:messageId — edit body in place. */
export const editMessageSchema = z.object({
  content: z.string().trim().min(1).max(CONTENT_MAX),
  /** True when `content` is an E2EE envelope (Phase 2). */
  encrypted: z.boolean().optional(),
});

/** POST /api/chat/messages/:messageId/react — toggle a single emoji (empty clears). */
export const reactMessageSchema = z.object({
  emoji: z.string().trim().max(16),
});

/** DELETE /api/chat/messages/:messageId — scope of deletion. */
export const deleteMessageSchema = z.object({
  scope: z.enum(["me", "everyone"]).default("me"),
});

/** PATCH /api/chat/:chatId/pin — pin/unpin for the current user. */
export const pinChatSchema = z.object({
  pinned: z.boolean(),
});

/** PATCH /api/chat/:chatId/mute — mute/unmute notifications for the current user (Phase 4). */
export const muteChatSchema = z.object({
  muted: z.boolean(),
});

/** PATCH /api/chat/:chatId/archive — archive/unarchive for the current user (Phase 4). */
export const archiveChatSchema = z.object({
  archived: z.boolean(),
});

/**
 * POST /api/chat/messages/:messageId/forward — forward a message to a friend (Phase 4). `targetUserId`
 * is the friend to forward to (server resolves/creates the 1:1 chat and enforces friendship). For an
 * E2EE text message the client re-encrypts the plaintext for the TARGET peer and passes it as
 * `content` (+ `encrypted`); for media the server copies the stored attachment, so `content` is omitted.
 */
export const forwardMessageSchema = z.object({
  targetUserId: z.string().min(1),
  content: z.string().trim().min(1).max(CONTENT_MAX).optional(),
  encrypted: z.boolean().optional(),
});

/**
 * POST /api/chat/:chatId/media — multipart body (the file itself is handled by multer; this
 * validates the optional text caption that can accompany an attachment). Sprint 5.
 */
export const uploadMediaBodySchema = z.object({
  caption: z.string().trim().max(MEDIA_CAPTION_MAX).optional(),
});

/** POST /api/chat/:chatId/poll — create a group poll (Phase 7A). */
export const createPollSchema = z.object({
  question: z.string().trim().min(1).max(POLL_QUESTION_MAX),
  options: z
    .array(z.string().trim().min(1).max(POLL_OPTION_TEXT_MAX))
    .min(POLL_MIN_OPTIONS)
    .max(POLL_MAX_OPTIONS),
});

/** POST /api/chat/messages/:messageId/vote — vote on a poll option (toggle). */
export const votePollSchema = z.object({
  optionId: z.string().trim().min(1),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type UpdateGroupPermissionsInput = z.infer<typeof updateGroupPermissionsSchema>;
export type AddGroupMemberInput = z.infer<typeof addGroupMemberSchema>;
export type LeaveGroupInput = z.infer<typeof leaveGroupSchema>;
export type CreateChatInput = z.infer<typeof createChatSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;
export type ReactMessageInput = z.infer<typeof reactMessageSchema>;
export type DeleteMessageInput = z.infer<typeof deleteMessageSchema>;
export type PinChatInput = z.infer<typeof pinChatSchema>;
export type MuteChatInput = z.infer<typeof muteChatSchema>;
export type ArchiveChatInput = z.infer<typeof archiveChatSchema>;
export type ForwardMessageInput = z.infer<typeof forwardMessageSchema>;
export type UploadMediaInput = z.infer<typeof uploadMediaBodySchema>;
export type CreatePollInput = z.infer<typeof createPollSchema>;
export type VotePollInput = z.infer<typeof votePollSchema>;
