import type { HydratedDocument } from "mongoose";
import { SOCKET_EVENTS } from "@linkr/shared";
import { features } from "../../config/env.js";
import { FriendshipModel } from "../../models/Friendship.js";
import { UserModel, type UserDoc } from "../../models/User.js";
import { isMongoConnected } from "../../config/db.js";
import { getSocketServer } from "../../sockets/io.js";
import { logger } from "../../utils/logger.js";
import {
  getOtherMemberId,
  getChatForUser,
  markIncomingMessagesDelivered,
  markMessagesRead,
  sendMessage,
} from "../chat/chat.service.js";
import { createNotification } from "../notifications/notifications.service.js";

/**
 * Dev/test bot (NOT for production). When `ENABLE_TEST_BOT` is on, a single `@linkr_bot`
 * account exists that auto-accepts friend requests and auto-replies to messages so a
 * developer can test real-time chat end-to-end without a second Google account.
 *
 * E2EE (Phase 2) note: the bot is a normal user row that has NO browser and therefore never
 * publishes an E2EE public key. The client looks up a peer's key before sending and, finding none
 * for the bot, automatically falls back to plaintext (encrypted in transit only) — this is the
 * intended "no E2EE with the bot" mode. Human↔human chats are end-to-end encrypted as normal. The
 * bot is force-disabled in production (`features.testBot`), so it never weakens a real deployment.
 */

const BOT_GOOGLE_ID = "linkr-test-bot";
const BOT_EMAIL = "bot@linkr.local";
const BOT_USERNAME = "linkr_bot";
const BOT_DISPLAY_NAME = "Linkr Bot";

let cachedBotId: string | null = null;

type UserDocument = HydratedDocument<UserDoc>;

/** Whether the test bot feature is active (flag on + DB reachable). */
export function isBotEnabled(): boolean {
  return features.testBot && isMongoConnected();
}

/** Create the bot user once (idempotent). Safe to call on every boot. */
export async function ensureBotUser(): Promise<string | null> {
  if (!isBotEnabled()) return null;
  try {
    let bot = (await UserModel.findOne({ googleId: BOT_GOOGLE_ID })) as UserDocument | null;
    if (!bot) {
      bot = (await UserModel.create({
        googleId: BOT_GOOGLE_ID,
        email: BOT_EMAIL,
        username: BOT_USERNAME,
        displayName: BOT_DISPLAY_NAME,
        avatar: undefined,
        bio: "I'm a friendly test bot. Add me and say hi to try out live chat.",
        status: "Always online for testing",
        onboarded: true,
        online: true,
        privacy: { lastSeen: "everyone", profile: "everyone", whoCanRequest: "everyone" },
      })) as UserDocument;
      logger.info("Test bot user created", { username: BOT_USERNAME });
    } else if (!bot.online) {
      bot.online = true;
      await bot.save();
    }
    cachedBotId = bot._id.toString();
    return cachedBotId;
  } catch (err) {
    logger.warn("Failed to ensure test bot user", {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export function getBotId(): string | null {
  return cachedBotId;
}

export function isBot(userId: string): boolean {
  return Boolean(cachedBotId) && userId === cachedBotId;
}

/**
 * If a pending friend request targets the bot, accept it automatically and notify the
 * requester. Returns true when it handled (accepted) the request.
 */
export async function maybeAutoAcceptFriendRequest(
  friendshipId: string,
  recipientId: string,
  requesterId: string,
): Promise<boolean> {
  if (!isBotEnabled() || !isBot(recipientId)) return false;

  try {
    const doc = await FriendshipModel.findById(friendshipId);
    if (!doc || doc.status !== "pending") return false;

    doc.status = "accepted";
    doc.actionBy = doc.recipient;
    await doc.save();

    const io = getSocketServer();
    io?.to(`user:${requesterId}`).emit(SOCKET_EVENTS.FRIEND_ACCEPTED, {
      friendship: {
        _id: doc._id.toString(),
        requester: doc.requester.toString(),
        recipient: doc.recipient.toString(),
        status: doc.status,
        actionBy: doc.actionBy.toString(),
        createdAt: (doc.createdAt ?? new Date()).toISOString(),
        updatedAt: (doc.updatedAt ?? new Date()).toISOString(),
      },
      from: {
        _id: cachedBotId,
        username: BOT_USERNAME,
        displayName: BOT_DISPLAY_NAME,
      },
    });
    // Notify the human requester that the bot accepted (actor = bot).
    void createNotification({
      userId: requesterId,
      type: "friend_accepted",
      ...(cachedBotId ? { actorId: cachedBotId } : {}),
    });
    return true;
  } catch (err) {
    logger.warn("Bot auto-accept failed", { err: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

function generateReply(text: string): string {
  const t = text.trim().toLowerCase();
  if (/^(hi|hello|hey|yo|hola)\b/.test(t)) {
    return "Hey! 👋 I'm the Linkr test bot. Send me anything and I'll echo back so you can see live chat working.";
  }
  if (t.includes("how are you")) {
    return "Running great — all sockets green. How's the build going?";
  }
  if (t.endsWith("?")) {
    return "Good question! I'm just a test bot, but your message reached the server and came back in real time. ✅";
  }
  if (t.includes("bye")) {
    return "Catch you later! Your messages are flowing through Socket.IO perfectly. 👋";
  }
  return `You said: "${text.trim()}". Real-time delivery is working! Try editing, replying, reacting, or pinning this chat.`;
}

/**
 * Dev-only: simulate the bot delivering then reading the human's message(s), emitting the
 * receipts to the human sender's room so their UI advances ✓ → ✓✓ → blue ✓✓. The bot is a member
 * of the chat, so `markIncomingMessagesDelivered` / `markMessagesRead` (run as the bot) update only
 * the human's messages. Never enabled for human↔human chats (real clients drive their own receipts).
 */
async function simulateBotReceipts(chatId: string, senderId: string, textLength: number): Promise<void> {
  if (!isBotEnabled() || !cachedBotId) return;

  const botId = cachedBotId;
  const io = getSocketServer();
  if (!io) return;

  const deliveredDelay = 400;
  const readDelay = Math.min(2000, 700 + textLength * 12);

  // ✓✓ grey — the bot "received" the message.
  setTimeout(() => {
    void (async () => {
      try {
        const delivered = await markIncomingMessagesDelivered(chatId, botId);
        for (const message of delivered) {
          io.to(`user:${senderId}`).emit(SOCKET_EVENTS.MESSAGE_DELIVERED, { message });
        }
      } catch (err) {
        logger.warn("Bot delivered-receipt failed", {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }, deliveredDelay);

  // Blue ✓✓ — the bot "read" the message.
  setTimeout(() => {
    void (async () => {
      try {
        const messages = await markMessagesRead(chatId, botId);
        if (messages.length > 0) {
          io.to(`user:${senderId}`).emit(SOCKET_EVENTS.MESSAGE_READ, { chatId, messages });
        }
      } catch (err) {
        logger.warn("Bot read-receipt failed", {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }, readDelay);
}

/**
 * If the other member of a chat is the bot, send an auto-reply after a short, human-ish delay
 * (with a typing indicator). No-op for human↔human chats.
 */
export async function maybeAutoReply(chatId: string, senderId: string, text: string): Promise<void> {
  if (!isBotEnabled() || !cachedBotId || isBot(senderId)) return;

  try {
    const chat = await getChatForUser(chatId, senderId);
    const otherId = await getOtherMemberId(chat, senderId);
    if (!isBot(otherId)) return;

    const io = getSocketServer();
    // Show the bot "typing" to the human.
    io?.to(`user:${senderId}`).emit(SOCKET_EVENTS.USER_TYPING, { chatId, userId: cachedBotId });

    // Dev-only: the bot has no browser/socket, so a human's messages to it would otherwise stay on a
    // single grey ✓ forever. Simulate the bot "receiving and reading" them so the sender sees the
    // normal ✓✓ (delivered) → blue ✓✓ (read) progression. Best-effort; gated by isBotEnabled().
    void simulateBotReceipts(chatId, senderId, text.length);

    const replyText = generateReply(text);
    const delay = Math.min(2500, 600 + replyText.length * 15);

    setTimeout(() => {
      void (async () => {
        try {
          const message = await sendMessage(chatId, cachedBotId!, { content: replyText });
          io?.to(`user:${senderId}`).emit(SOCKET_EVENTS.MESSAGE_NEW, { message });
          io?.to(`user:${cachedBotId}`).emit(SOCKET_EVENTS.MESSAGE_NEW, { message });
        } catch (err) {
          logger.warn("Bot auto-reply send failed", {
            err: err instanceof Error ? err.message : String(err),
          });
        }
      })();
    }, delay);
  } catch {
    /* ignore — bot replies are best-effort */
  }
}
