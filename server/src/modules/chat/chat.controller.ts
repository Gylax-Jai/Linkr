import type { Request } from "express";
import type {
  ArchiveChatInput,
  CreateChatInput,
  DeleteMessageInput,
  EditMessageInput,
  ForwardMessageInput,
  MuteChatInput,
  PinChatInput,
  ReactMessageInput,
  SendMessageInput,
  UploadMediaInput,
} from "@linkr/shared";
import { SOCKET_EVENTS } from "@linkr/shared";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getSocketServer } from "../../sockets/io.js";
import {
  deleteChatForUser,
  deleteMessage,
  editMessage,
  forwardMessage,
  getChatForUser,
  getMessageForUser,
  getOrCreateDirectChat,
  getOtherMemberId,
  listChatsForUser,
  listMessages,
  reactToMessage,
  sendMessage,
  setChatArchived,
  setChatMuted,
  setChatPinned,
} from "./chat.service.js";
import { resolveLocalMediaPath, storeMedia, validateUpload } from "./chat.media.service.js";

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

/** GET /api/chat — list conversations for the authenticated user. */
export const getChats = asyncHandler(async (req, res) => {
  const chats = await listChatsForUser(requireUserId(req));
  res.status(200).json({ chats });
});

/** POST /api/chat — create or return existing 1:1 chat with a friend. */
export const createChat = asyncHandler(async (req, res) => {
  const { participantId } = req.body as CreateChatInput;
  const chat = await getOrCreateDirectChat(requireUserId(req), participantId);
  res.status(200).json({ chatId: chat._id.toString() });
});

/** GET /api/chat/:chatId/messages — paginated message history. */
export const getMessages = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  if (!chatId) throw ApiError.badRequest("Missing chatId");
  const { before, limit } = req.query as unknown as { before?: string; limit: number };
  const messages = await listMessages(chatId, requireUserId(req), { before, limit });
  res.status(200).json({ messages });
});

/** POST /api/chat/:chatId/messages — send a message (REST fallback; primary path is socket). */
export const postMessage = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  if (!chatId) throw ApiError.badRequest("Missing chatId");
  const { content, replyTo, encrypted } = req.body as SendMessageInput;
  const message = await sendMessage(chatId, requireUserId(req), { content, replyTo, encrypted });
  res.status(201).json({ message });
});

/**
 * POST /api/chat/:chatId/media — upload an attachment (multipart). multer has already parsed the
 * file into memory; we validate (allowlist + magic bytes + size), store it (Cloudinary or local),
 * then create a normal message so it broadcasts over MESSAGE_NEW like any other.
 */
export const postMedia = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  if (!chatId) throw ApiError.badRequest("Missing chatId");
  const file = req.file;
  if (!file) throw ApiError.badRequest("No file uploaded");

  const { caption } = req.body as UploadMediaInput;
  const userId = requireUserId(req);

  const validated = validateUpload(file.originalname, file.buffer);
  const url = await storeMedia(validated, file.buffer);

  const message = await sendMessage(chatId, userId, {
    content: caption,
    media: {
      type: validated.type,
      url,
      name: validated.displayName,
      size: file.buffer.length,
      mime: validated.mime,
    },
  });

  // Broadcast to BOTH members so it renders live (mirrors the socket send path). The recipient is
  // the other chat member — emitting to `message.sender` would just notify the uploader twice, so
  // the recipient's media never arrived until their next chat-list refetch.
  const io = getSocketServer();
  if (io) {
    const chat = await getChatForUser(chatId, userId);
    const otherId = await getOtherMemberId(chat, userId);
    io.to(`user:${userId}`).emit(SOCKET_EVENTS.MESSAGE_NEW, { message });
    // Skip the peer emit for self ("Saved messages") chats — otherId === userId there.
    if (otherId !== userId) io.to(`user:${otherId}`).emit(SOCKET_EVENTS.MESSAGE_NEW, { message });
  }

  res.status(201).json({ message });
});

/**
 * GET /api/chat/media/:messageId — authenticated download for locally-stored media. Re-checks that
 * the requester is a member of the chat the media belongs to, then streams the file as an
 * attachment (never inline-executed). Cloudinary URLs are served directly by Cloudinary instead.
 */
export const getMedia = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  if (!messageId) throw ApiError.badRequest("Missing messageId");

  const message = await getMessageForUser(messageId, requireUserId(req));
  const mediaRef = typeof message.mediaUrl === "string" ? message.mediaUrl : "";
  if (!mediaRef || message.deletedForEveryone) {
    throw ApiError.notFound("Media not found");
  }

  const filePath = await resolveLocalMediaPath(mediaRef);
  if (!filePath) {
    throw ApiError.notFound("Media not found");
  }

  const mime = typeof message.mediaMime === "string" ? message.mediaMime : "application/octet-stream";
  const name = typeof message.mediaName === "string" ? message.mediaName : "download";
  res.setHeader("Content-Type", mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(name)}"`);
  res.sendFile(filePath);
});

/** PATCH /api/chat/messages/:messageId — edit a message body (sender only). */
export const patchMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  if (!messageId) throw ApiError.badRequest("Missing messageId");
  const { content, encrypted } = req.body as EditMessageInput;
  const message = await editMessage(messageId, requireUserId(req), content, encrypted);
  res.status(200).json({ message });
});

/** DELETE /api/chat/messages/:messageId — delete for me or for everyone. */
export const removeMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  if (!messageId) throw ApiError.badRequest("Missing messageId");
  const { scope } = req.body as DeleteMessageInput;
  const message = await deleteMessage(messageId, requireUserId(req), scope);
  res.status(200).json({ message });
});

/** POST /api/chat/messages/:messageId/react — toggle an emoji reaction. */
export const reactMessage = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  if (!messageId) throw ApiError.badRequest("Missing messageId");
  const { emoji } = req.body as ReactMessageInput;
  const message = await reactToMessage(messageId, requireUserId(req), emoji);
  res.status(200).json({ message });
});

/** POST /api/chat/messages/:messageId/forward — forward a message to a friend (Phase 4). */
export const postForward = asyncHandler(async (req, res) => {
  const { messageId } = req.params;
  if (!messageId) throw ApiError.badRequest("Missing messageId");
  const { targetUserId, content, encrypted } = req.body as ForwardMessageInput;
  const message = await forwardMessage(messageId, requireUserId(req), { targetUserId, content, encrypted });
  res.status(201).json({ message });
});

/** DELETE /api/chat/:chatId — per-user soft delete (hide the chat from the current user's list). */
export const deleteChat = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  if (!chatId) throw ApiError.badRequest("Missing chatId");
  await deleteChatForUser(chatId, requireUserId(req));
  res.status(204).end();
});

/** PATCH /api/chat/:chatId/pin — pin/unpin a chat for the current user. */
export const pinChat = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  if (!chatId) throw ApiError.badRequest("Missing chatId");
  const { pinned } = req.body as PinChatInput;
  await setChatPinned(chatId, requireUserId(req), pinned);
  res.status(200).json({ ok: true, pinned });
});

/** PATCH /api/chat/:chatId/mute — mute/unmute a chat's notifications for the current user. */
export const muteChat = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  if (!chatId) throw ApiError.badRequest("Missing chatId");
  const { muted } = req.body as MuteChatInput;
  await setChatMuted(chatId, requireUserId(req), muted);
  res.status(200).json({ ok: true, muted });
});

/** PATCH /api/chat/:chatId/archive — archive/unarchive a chat for the current user. */
export const archiveChat = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  if (!chatId) throw ApiError.badRequest("Missing chatId");
  const { archived } = req.body as ArchiveChatInput;
  await setChatArchived(chatId, requireUserId(req), archived);
  res.status(200).json({ ok: true, archived });
});
