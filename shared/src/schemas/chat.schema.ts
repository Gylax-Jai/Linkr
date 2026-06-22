import { z } from "zod";
import { MEDIA_CAPTION_MAX } from "../constants/limits.js";

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

/**
 * POST /api/chat/:chatId/media — multipart body (the file itself is handled by multer; this
 * validates the optional text caption that can accompany an attachment). Sprint 5.
 */
export const uploadMediaBodySchema = z.object({
  caption: z.string().trim().max(MEDIA_CAPTION_MAX).optional(),
});

export type CreateChatInput = z.infer<typeof createChatSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type EditMessageInput = z.infer<typeof editMessageSchema>;
export type ReactMessageInput = z.infer<typeof reactMessageSchema>;
export type DeleteMessageInput = z.infer<typeof deleteMessageSchema>;
export type PinChatInput = z.infer<typeof pinChatSchema>;
export type UploadMediaInput = z.infer<typeof uploadMediaBodySchema>;
