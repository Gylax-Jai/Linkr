import type { Server, Socket } from "socket.io";
import { SOCKET_EVENTS } from "@linkr/shared";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";
import { areFriends } from "../modules/friends/friendship.helpers.js";
import {
  getChatForUser,
  getOtherMemberId,
  markMessageDelivered,
  markMessagesRead,
  sendMessage,
  emitToChatMembers,
} from "../modules/chat/chat.service.js";
import { maybeAutoReply } from "../modules/bot/bot.service.js";
import { requireSocketUser } from "./auth.socket.js";

interface MessageSendPayload {
  chatId: string;
  content: string;
  replyTo?: string;
  /** True when `content` is an E2EE envelope (Phase 2); forwarded to storage untouched. */
  encrypted?: boolean;
}

interface TypingPayload {
  chatId: string;
}

interface MessageReadPayload {
  chatId: string;
}

interface MessageDeliveredPayload {
  messageId: string;
}

/**
 * Chat events (blueprint §11): message:send → message:new → delivered → read.
 * EVERY event re-checks friendship server-side (blueprint §5).
 */
export function registerChatHandlers(io: Server, socket: Socket): void {
  const userId = requireSocketUser(socket);
  if (!userId) return;

  socket.on(SOCKET_EVENTS.MESSAGE_SEND, async (payload: MessageSendPayload, ack?: (err?: string) => void) => {
    try {
      if (!payload?.chatId || !payload?.content?.trim()) {
        ack?.("Invalid payload");
        return;
      }

      const chat = await getChatForUser(payload.chatId, userId);
      const selfChat = chat.type === "self" || chat.members.length === 1;
      const groupChat = chat.type === "group";

      if (!selfChat && !groupChat) {
        const otherId = await getOtherMemberId(chat, userId);
        if (!(await areFriends(userId, otherId))) {
          ack?.("NOT_FRIENDS");
          return;
        }
      }

      if (groupChat && payload.encrypted) {
        ack?.("Group messages cannot be end-to-end encrypted");
        return;
      }

      const message = await sendMessage(payload.chatId, userId, {
        content: payload.content.trim(),
        replyTo: payload.replyTo,
        encrypted: payload.encrypted,
      });
      emitToChatMembers(chat, SOCKET_EVENTS.MESSAGE_NEW, { message });
      ack?.();

      // Dev/test bot: only for 1:1 chats with a plaintext peer.
      if (!selfChat && !groupChat) {
        void maybeAutoReply(payload.chatId, userId, payload.content.trim());
      }
    } catch (err) {
      logger.warn("message:send failed", { userId, err: err instanceof Error ? err.message : String(err) });
      ack?.(err instanceof ApiError ? err.message : "Send failed");
    }
  });

  socket.on(SOCKET_EVENTS.MESSAGE_DELIVERED, async (payload: MessageDeliveredPayload) => {
    try {
      if (!payload?.messageId) return;
      const message = await markMessageDelivered(payload.messageId, userId);
      if (!message) return;

      io.to(`user:${message.sender}`).emit(SOCKET_EVENTS.MESSAGE_DELIVERED, { message });
    } catch {
      /* ignore */
    }
  });

  socket.on(SOCKET_EVENTS.MESSAGE_READ, async (payload: MessageReadPayload) => {
    try {
      if (!payload?.chatId) return;
      const messages = await markMessagesRead(payload.chatId, userId);
      if (messages.length === 0) return;

      const chat = await getChatForUser(payload.chatId, userId);
      for (const member of chat.members) {
        const memberId = member.toString();
        if (memberId === userId) continue;
        io.to(`user:${memberId}`).emit(SOCKET_EVENTS.MESSAGE_READ, { chatId: payload.chatId, messages });
      }
    } catch {
      /* ignore */
    }
  });
}

export function registerTypingHandler(io: Server, socket: Socket): void {
  const userId = requireSocketUser(socket);
  if (!userId) return;

  const relayTyping = async (payload: TypingPayload, event: typeof SOCKET_EVENTS.USER_TYPING | typeof SOCKET_EVENTS.USER_TYPING_STOP) => {
    try {
      if (!payload?.chatId) return;
      const chat = await getChatForUser(payload.chatId, userId);
      const selfChat = chat.type === "self" || chat.members.length === 1;
      const groupChat = chat.type === "group";

      if (!selfChat && !groupChat) {
        const otherId = await getOtherMemberId(chat, userId);
        if (!(await areFriends(userId, otherId))) return;
        io.to(`user:${otherId}`).emit(event, { chatId: payload.chatId, userId });
        return;
      }

      if (groupChat) {
        for (const member of chat.members) {
          const memberId = member.toString();
          if (memberId === userId) continue;
          io.to(`user:${memberId}`).emit(event, { chatId: payload.chatId, userId });
        }
      }
    } catch {
      /* ignore */
    }
  };

  socket.on(SOCKET_EVENTS.USER_TYPING, (payload: TypingPayload) => {
    void relayTyping(payload, SOCKET_EVENTS.USER_TYPING);
  });

  socket.on(SOCKET_EVENTS.USER_TYPING_STOP, (payload: TypingPayload) => {
    void relayTyping(payload, SOCKET_EVENTS.USER_TYPING_STOP);
  });
}
