import type { HydratedDocument } from "mongoose";
import type {
  CallLogMeta,
  CallMedia,
  CallOutcome,
  ChatListItem,
  ChatParticipant,
  ChatParticipantFriendship,
  MessageDTO,
  MessageType,
  ReplyPreview,
} from "@linkr/shared";
import { GROUP_MAX_MEMBERS, SOCKET_EVENTS } from "@linkr/shared";
import { ChatModel, type ChatDoc } from "../../models/Chat.js";
import { FriendshipModel } from "../../models/Friendship.js";
import { MessageModel, type MessageDoc } from "../../models/Message.js";
import { UserModel } from "../../models/User.js";
import { ApiError } from "../../utils/ApiError.js";
import { getSocketServer } from "../../sockets/io.js";
import { areFriends } from "../friends/friendship.helpers.js";
import { createNotification } from "../notifications/notifications.service.js";
import { resolveAvatarUrl, resolveGroupAvatarUrl } from "../users/avatar.helpers.js";
import {
  canViewAvatarThumbnail,
  canViewLastSeen,
  canViewProfileDetails,
  canZoomAvatar,
} from "../users/privacy.helpers.js";
import { LOCAL_MEDIA_PREFIX } from "./chat.media.service.js";

type ChatDocument = HydratedDocument<ChatDoc>;
type MessageDocument = HydratedDocument<MessageDoc>;

const REPLY_POPULATE = {
  path: "replyTo",
  select: "content sender deletedForEveryone encrypted",
} as const;

/**
 * Resolve a user's currently-visible custom status: returns the text only if it's non-empty AND
 * not past its expiry (Sprint C.1). Expired or unset statuses resolve to `undefined`.
 */
function activeStatus(status?: string | null, expiresAt?: Date | null): string | undefined {
  const text = status?.trim();
  if (!text) return undefined;
  if (expiresAt && expiresAt.getTime() <= Date.now()) return undefined;
  return text;
}

/** Build a small reply preview from a populated `replyTo` doc (undefined if not populated). */
function toReplyPreview(replyTo: unknown): ReplyPreview | undefined {
  if (!replyTo || typeof replyTo !== "object" || !("sender" in replyTo)) return undefined;
  const r = replyTo as Pick<MessageDoc, "content" | "sender" | "deletedForEveryone" | "encrypted"> & {
    _id: { toString(): string };
  };
  const deleted = Boolean(r.deletedForEveryone);
  return {
    _id: r._id.toString(),
    sender: String(r.sender),
    content: deleted ? undefined : typeof r.content === "string" ? r.content : undefined,
    encrypted: deleted ? undefined : Boolean(r.encrypted),
    deleted,
  };
}

/**
 * Resolve the stored media reference to a client-usable URL: a `local:` reference becomes the
 * authenticated download route (`/chat/media/:id`); a Cloudinary secure URL is returned as-is.
 */
function toPublicMediaUrl(doc: MessageDocument): string | undefined {
  const ref = typeof doc.mediaUrl === "string" && doc.mediaUrl.length > 0 ? doc.mediaUrl : undefined;
  if (!ref) return undefined;
  if (ref.startsWith(LOCAL_MEDIA_PREFIX)) return `/chat/media/${doc._id.toString()}`;
  return ref;
}

/** Map Mongoose's loosely-typed `call` subdoc to a validated `CallLogMeta` (InferSchemaType → `{}`). */
function toCallLogMeta(raw: unknown): CallLogMeta | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const c = raw as Record<string, unknown>;
  if (c.media !== "audio" && c.media !== "video") return undefined;
  const outcome = c.outcome;
  if (
    outcome !== "completed" &&
    outcome !== "missed" &&
    outcome !== "declined" &&
    outcome !== "cancelled" &&
    outcome !== "failed"
  ) {
    return undefined;
  }
  return {
    media: c.media as CallMedia,
    outcome: outcome as CallOutcome,
    ...(typeof c.durationSec === "number" ? { durationSec: c.durationSec } : {}),
  };
}

function toMessageDTO(doc: MessageDocument): MessageDTO {
  const deletedForEveryone = Boolean(doc.deletedForEveryone);
  const mediaUrl = deletedForEveryone ? undefined : toPublicMediaUrl(doc);
  return {
    _id: doc._id.toString(),
    chatId: String(doc.chatId),
    sender: String(doc.sender),
    type: doc.type as MessageDTO["type"],
    content: deletedForEveryone ? undefined : typeof doc.content === "string" ? doc.content : undefined,
    encrypted: deletedForEveryone ? false : Boolean(doc.encrypted),
    status: doc.status as MessageDTO["status"],
    readBy: (doc.readBy ?? []).map((id) => id.toString()),
    createdAt: (doc.createdAt instanceof Date ? doc.createdAt : new Date()).toISOString(),
    mediaUrl,
    mediaType: mediaUrl ? (doc.type as MessageDTO["type"]) : undefined,
    mediaName: mediaUrl && typeof doc.mediaName === "string" ? doc.mediaName : undefined,
    mediaSize: mediaUrl && typeof doc.mediaSize === "number" ? doc.mediaSize : undefined,
    mediaMime: mediaUrl && typeof doc.mediaMime === "string" ? doc.mediaMime : undefined,
    replyTo: toReplyPreview(doc.replyTo),
    call: toCallLogMeta(doc.call),
    reactions: deletedForEveryone
      ? []
      : (doc.reactions ?? []).map((r) => ({ user: String(r.user), emoji: r.emoji })),
    editedAt: doc.editedAt instanceof Date ? doc.editedAt.toISOString() : undefined,
    forwarded: deletedForEveryone ? false : Boolean(doc.forwarded),
    deletedForEveryone,
  };
}

/** Emit a chat event to every member of a chat (both sides of a 1:1). */
function emitToChatMembers(chat: ChatDocument, event: string, payload: unknown): void {
  const io = getSocketServer();
  if (!io) return;
  for (const member of chat.members) {
    io.to(`user:${member.toString()}`).emit(event, payload);
  }
}

async function getChatForUser(chatId: string, userId: string): Promise<ChatDocument> {
  const chat = await ChatModel.findById(chatId);
  if (!chat) {
    throw ApiError.notFound("Chat not found");
  }
  const memberIds = chat.members.map((m) => m.toString());
  if (!memberIds.includes(userId)) {
    throw ApiError.forbidden("NOT_MEMBER", "You are not a member of this chat");
  }
  return chat;
}

/** Load a message and assert the user is a member of its chat (used by the media download route). */
async function getMessageForUser(messageId: string, userId: string): Promise<MessageDocument> {
  const message = await MessageModel.findById(messageId);
  if (!message) throw ApiError.notFound("Message not found");
  await getChatForUser(String(message.chatId), userId);
  return message;
}

/** A self ("Saved messages") chat has a single member: the owner (Sprint C.2). */
function isSelfChat(chat: ChatDocument): boolean {
  return chat.type === "self" || chat.members.length === 1;
}

function isGroupChat(chat: ChatDocument): boolean {
  return chat.type === "group";
}

async function getOtherMemberId(chat: ChatDocument, userId: string): Promise<string> {
  // Self chats have no "other" side — the counterpart is the user themselves.
  if (isSelfChat(chat)) return userId;
  const other = chat.members.find((m) => m.toString() !== userId);
  if (!other) {
    throw ApiError.badRequest("Invalid chat members");
  }
  return other.toString();
}

/**
 * Find or create the user's "Saved messages" chat (Sprint C.2) — a single-member self chat used to
 * jot notes / send things to yourself. E2EE still applies (the client seals to your own key).
 */
export async function getOrCreateSelfChat(userId: string): Promise<ChatDocument> {
  const existing = await ChatModel.findOne({ type: "self", members: { $all: [userId], $size: 1 } });
  if (existing) {
    if ((existing.hiddenFor ?? []).some((id) => id.toString() === userId)) {
      existing.set(
        "hiddenFor",
        existing.hiddenFor.filter((id) => id.toString() !== userId),
      );
      await existing.save();
    }
    return existing;
  }
  return ChatModel.create({ type: "self", members: [userId], pinnedBy: [] });
}

/** Find or create a 1:1 chat between friends. */
export async function getOrCreateDirectChat(userId: string, participantId: string): Promise<ChatDocument> {
  if (userId === participantId) {
    // Self chats are a distinct, single-member type ("Saved messages").
    return getOrCreateSelfChat(userId);
  }

  const participant = await UserModel.findById(participantId);
  if (!participant?.onboarded) {
    throw ApiError.notFound("User not found");
  }

  if (!(await areFriends(userId, participantId))) {
    throw ApiError.forbidden("NOT_FRIENDS", "You must be friends to start a chat");
  }

  const existing = await ChatModel.findOne({
    type: "1:1",
    members: { $all: [userId, participantId], $size: 2 },
  });
  if (existing) {
    // Re-opening a chat the user had hidden brings it back to their list.
    if ((existing.hiddenFor ?? []).some((id) => id.toString() === userId)) {
      existing.set(
        "hiddenFor",
        existing.hiddenFor.filter((id) => id.toString() !== userId),
      );
      await existing.save();
    }
    return existing;
  }

  return ChatModel.create({
    type: "1:1",
    members: [userId, participantId],
    pinnedBy: [],
  });
}

type ParticipantUser = {
  id: string;
  username?: string | null;
  displayName: string;
  avatar?: string | null;
  online?: boolean;
  lastSeen?: Date | null;
  bio?: string | null;
  status?: string | null;
  statusExpiresAt?: Date | null;
  privacy?: Parameters<typeof canViewLastSeen>[0];
};

/** Build a ChatParticipant DTO with privacy + friendship context for the viewing user. */
function buildChatParticipant(
  user: ParticipantUser,
  viewerId: string,
  relationship: { status: string; actionBy: { toString(): string }; _id: { toString(): string }; requester: { toString(): string } } | null,
  selfParticipant: boolean,
): ChatParticipant {
  let friendship: ChatParticipantFriendship | undefined;
  if (relationship) {
    friendship = {
      status: relationship.status as ChatParticipantFriendship["status"],
      blockedByMe:
        relationship.status === "blocked" && relationship.actionBy.toString() === viewerId,
      friendshipId: relationship._id.toString(),
      ...(relationship.status === "pending"
        ? {
            direction:
              relationship.requester.toString() === viewerId ? ("outgoing" as const) : ("incoming" as const),
          }
        : {}),
    };
  }

  const viewerIsFriend = selfParticipant || relationship?.status === "accepted";
  const presenceVisible = selfParticipant || canViewLastSeen(user.privacy, viewerIsFriend);
  const profileDetailsVisible =
    selfParticipant || canViewProfileDetails(user.privacy, viewerIsFriend);
  const avatarVisible = selfParticipant || canViewAvatarThumbnail(user.privacy, viewerIsFriend);
  const avatarZoomable = selfParticipant || canZoomAvatar(user.privacy, viewerIsFriend);

  return {
    _id: user.id,
    username: user.username ?? undefined,
    displayName: profileDetailsVisible ? user.displayName : "Linkr user",
    avatar: avatarVisible ? resolveAvatarUrl(user.avatar, user.id) : undefined,
    online: presenceVisible ? Boolean(user.online) : false,
    lastSeen: presenceVisible ? user.lastSeen?.toISOString() : undefined,
    presenceVisible,
    profileDetailsVisible,
    contactCardVisible: avatarVisible,
    avatarZoomable,
    bio: profileDetailsVisible ? user.bio ?? undefined : undefined,
    status: profileDetailsVisible ? activeStatus(user.status, user.statusExpiresAt) : undefined,
    friendship,
  };
}

/** Create a group chat with friends (Phase 6). Creator is admin; max 16 members total. */
export async function createGroup(
  creatorId: string,
  options: { name: string; memberIds: string[] },
): Promise<ChatDocument> {
  const name = options.name.trim();
  const uniqueMemberIds = [...new Set(options.memberIds.filter((id) => id !== creatorId))];

  if (uniqueMemberIds.length === 0) {
    throw ApiError.badRequest("Select at least one friend");
  }

  if (uniqueMemberIds.length + 1 > GROUP_MAX_MEMBERS) {
    throw ApiError.badRequest(`Groups can have at most ${GROUP_MAX_MEMBERS} members`);
  }

  for (const memberId of uniqueMemberIds) {
    const user = await UserModel.findById(memberId);
    if (!user?.onboarded) throw ApiError.notFound("User not found");
    if (!(await areFriends(creatorId, memberId))) {
      throw ApiError.forbidden("NOT_FRIENDS", "All members must be your friends");
    }
  }

  return ChatModel.create({
    type: "group",
    name,
    members: [creatorId, ...uniqueMemberIds],
    admins: [creatorId],
    pinnedBy: [],
  });
}

/** List all chats for the user with participant/group info and last message preview. */
export async function listChatsForUser(userId: string): Promise<ChatListItem[]> {
  const chats = await ChatModel.find({
    members: userId,
    type: { $in: ["1:1", "self", "group"] },
    hiddenFor: { $ne: userId },
  })
    .sort({ updatedAt: -1 })
    .populate<{ lastMessage: MessageDocument | null }>({
      path: "lastMessage",
      select:
        "content sender status readBy createdAt chatId type encrypted mediaUrl mediaName mediaSize mediaMime deletedForEveryone call",
    });

  // Batch participant + friendship lookups (Phase 4.2 — avoid N+1 per chat row).
  const directMeta: Array<{ chat: ChatDocument; selfChat: boolean; participantId: string }> = [];
  const groupChats: ChatDocument[] = [];
  const participantIdSet = new Set<string>();

  for (const chat of chats) {
    if (isGroupChat(chat)) {
      groupChats.push(chat);
      continue;
    }
    const selfChat = isSelfChat(chat);
    const participantId = selfChat
      ? userId
      : chat.members.find((m) => m.toString() !== userId)?.toString();
    if (!participantId) continue;
    directMeta.push({ chat, selfChat, participantId });
    participantIdSet.add(participantId);
  }

  const participantIds = [...new Set([...participantIdSet, userId])];
  const participants = participantIds.length
    ? await UserModel.find({ _id: { $in: participantIds } }).select(
        "username displayName avatar online lastSeen bio status statusExpiresAt privacy",
      )
    : [];
  const participantById = new Map(
    participants.map((p) => [
      p.id,
      {
        id: p.id,
        username: p.username,
        displayName: p.displayName,
        avatar: p.avatar,
        online: p.online,
        lastSeen: p.lastSeen,
        bio: p.bio,
        status: p.status,
        statusExpiresAt: p.statusExpiresAt,
        privacy: p.privacy,
      } satisfies ParticipantUser,
    ]),
  );

  const peerIds = participantIds.filter((id) => id !== userId);
  const friendships = peerIds.length
    ? await FriendshipModel.find({
        $or: [
          { requester: userId, recipient: { $in: peerIds } },
          { recipient: userId, requester: { $in: peerIds } },
        ],
      })
    : [];
  const friendshipByPeer = new Map<string, (typeof friendships)[number]>();
  for (const f of friendships) {
    const requesterId = f.requester.toString();
    const peerId = requesterId === userId ? f.recipient.toString() : requesterId;
    friendshipByPeer.set(peerId, f);
  }

  const items: ChatListItem[] = [];

  for (const { chat, selfChat, participantId } of directMeta) {
    const user = participantById.get(participantId);
    if (!user) continue;

    const pinned = (chat.pinnedBy ?? []).some((id) => id.toString() === userId);
    const muted = (chat.mutedBy ?? []).some((id) => id.toString() === userId);
    const archived = (chat.archivedBy ?? []).some((id) => id.toString() === userId);
    const lastMsg = chat.lastMessage ? toMessageDTO(chat.lastMessage as MessageDocument) : undefined;

    let unreadCount = 0;
    if (lastMsg && lastMsg.sender !== userId && !lastMsg.readBy.includes(userId)) {
      unreadCount = 1;
    }

    const relationship = selfChat ? null : friendshipByPeer.get(participantId) ?? null;
    const participant = buildChatParticipant(user, userId, relationship, selfChat);

    items.push({
      _id: chat._id.toString(),
      type: selfChat ? "self" : "1:1",
      participant,
      lastMessage: lastMsg,
      pinned,
      muted,
      archived,
      unreadCount,
      updatedAt: (chat.updatedAt instanceof Date ? chat.updatedAt : chat.createdAt).toISOString(),
    });
  }

  for (const chat of groupChats) {
    const pinned = (chat.pinnedBy ?? []).some((id) => id.toString() === userId);
    const muted = (chat.mutedBy ?? []).some((id) => id.toString() === userId);
    const archived = (chat.archivedBy ?? []).some((id) => id.toString() === userId);
    const lastMsg = chat.lastMessage ? toMessageDTO(chat.lastMessage as MessageDocument) : undefined;

    let unreadCount = 0;
    if (lastMsg && lastMsg.sender !== userId && !lastMsg.readBy.includes(userId)) {
      unreadCount = 1;
    }

    const memberIds = chat.members.map((m) => m.toString());
    const adminIds = (chat.admins ?? []).map((id) => id.toString());

    items.push({
      _id: chat._id.toString(),
      type: "group",
      group: {
        name: typeof chat.name === "string" && chat.name.trim() ? chat.name.trim() : "Group",
        avatar:
          typeof chat.avatar === "string" && chat.avatar
            ? resolveGroupAvatarUrl(chat.avatar, chat._id.toString())
            : undefined,
        memberCount: memberIds.length,
        admins: adminIds,
        isAdmin: adminIds.includes(userId),
      },
      lastMessage: lastMsg,
      pinned,
      muted,
      archived,
      unreadCount,
      updatedAt: (chat.updatedAt instanceof Date ? chat.updatedAt : chat.createdAt).toISOString(),
    });
  }

  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return items;
}

/** Full member roster for a group (lazy-loaded by the client — not included in GET /chat). */
export async function listGroupMembersForChat(chatId: string, userId: string): Promise<ChatParticipant[]> {
  const chat = await getChatForUser(chatId, userId);
  if (!isGroupChat(chat)) {
    throw ApiError.badRequest("Not a group chat");
  }

  const memberIds = chat.members.map((m) => m.toString());
  const participants = memberIds.length
    ? await UserModel.find({ _id: { $in: memberIds } }).select(
        "username displayName avatar online lastSeen bio status statusExpiresAt privacy",
      )
    : [];

  const participantById = new Map(
    participants.map((p) => [
      p.id,
      {
        id: p.id,
        username: p.username,
        displayName: p.displayName,
        avatar: p.avatar,
        online: p.online,
        lastSeen: p.lastSeen,
        bio: p.bio,
        status: p.status,
        statusExpiresAt: p.statusExpiresAt,
        privacy: p.privacy,
      } satisfies ParticipantUser,
    ]),
  );

  const peerIds = memberIds.filter((id) => id !== userId);
  const friendships = peerIds.length
    ? await FriendshipModel.find({
        $or: [
          { requester: userId, recipient: { $in: peerIds } },
          { recipient: userId, requester: { $in: peerIds } },
        ],
      })
    : [];
  const friendshipByPeer = new Map<string, (typeof friendships)[number]>();
  for (const f of friendships) {
    const requesterId = f.requester.toString();
    const peerId = requesterId === userId ? f.recipient.toString() : requesterId;
    friendshipByPeer.set(peerId, f);
  }

  const members: ChatParticipant[] = [];
  for (const memberId of memberIds) {
    const user = participantById.get(memberId);
    if (!user) continue;
    const selfParticipant = memberId === userId;
    const relationship = selfParticipant ? null : friendshipByPeer.get(memberId) ?? null;
    members.push(buildChatParticipant(user, userId, relationship, selfParticipant));
  }
  return members;
}

/** Paginated message history (newest first in DB query, returned chronological). */
export async function listMessages(
  chatId: string,
  userId: string,
  options: { before?: string; limit: number },
): Promise<MessageDTO[]> {
  await getChatForUser(chatId, userId);

  // Keep "deleted for everyone" rows (shown as a placeholder); hide only "deleted for me".
  const filter: Record<string, unknown> = { chatId, deletedFor: { $nin: [userId] } };
  if (options.before) {
    filter._id = { $lt: options.before };
  }

  const messages = await MessageModel.find(filter)
    .sort({ createdAt: -1 })
    .limit(options.limit)
    .populate(REPLY_POPULATE);

  return messages.reverse().map((m) => toMessageDTO(m));
}

/** Media payload for a message (Sprint 5). `url` is the internal storage reference. */
export interface SendMessageMedia {
  type: MessageType; // "image" | "file" (video/voice reuse the file path)
  url: string;
  name: string;
  size: number;
  mime: string;
}

export interface SendMessageOptions {
  content?: string;
  replyTo?: string;
  media?: SendMessageMedia;
  /** True when `content` is an E2EE envelope (Phase 2); stored verbatim, never read by the server. */
  encrypted?: boolean;
  /** True when this message is the result of a forward (Phase 4). */
  forwarded?: boolean;
}

function truncatePreview(text: string, max = 80): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/** Build a short, plaintext preview for the recipient's notification (never the full body). */
function buildMessagePreview(
  media: SendMessageMedia | undefined,
  content?: string,
  encrypted?: boolean,
): string {
  // E2EE text is opaque to the server, so we can't preview it — use a generic, content-free label.
  if (encrypted && !media) return "🔒 New message";
  if (media) {
    if (content && !encrypted) return truncatePreview(content);
    return media.type === "image" ? "📷 Photo" : `📎 ${media.name}`;
  }
  return truncatePreview(content ?? "");
}

/** Persist a message (text and/or media), optionally as a reply. Notifies the recipient. */
export async function sendMessage(
  chatId: string,
  senderId: string,
  options: SendMessageOptions,
): Promise<MessageDTO> {
  const chat = await getChatForUser(chatId, senderId);
  const selfChat = isSelfChat(chat);
  const groupChat = isGroupChat(chat);

  if (groupChat && options.encrypted) {
    throw ApiError.badRequest("Group messages are not end-to-end encrypted");
  }

  if (!selfChat && !groupChat) {
    const otherId = await getOtherMemberId(chat, senderId);
    if (!(await areFriends(senderId, otherId))) {
      throw ApiError.forbidden("NOT_FRIENDS", "You must be friends to send messages");
    }
  }

  const content = options.content?.trim() ? options.content.trim() : undefined;
  const media = options.media;
  if (!content && !media) {
    throw ApiError.badRequest("A message must have text or media");
  }

  // Reply target must belong to the same chat.
  let replyId: string | undefined;
  if (options.replyTo) {
    const parent = await MessageModel.findById(options.replyTo).select("_id chatId");
    if (parent && String(parent.chatId) === chatId) {
      replyId = parent._id.toString();
    }
  }

  // Media is not encrypted in Phase 2 (text-only E2EE); groups are always plaintext.
  const encrypted = !groupChat && Boolean(options.encrypted) && !media;

  const message = await MessageModel.create({
    chatId,
    sender: senderId,
    type: media ? media.type : "text",
    ...(content ? { content } : {}),
    ...(encrypted ? { encrypted: true } : {}),
    ...(options.forwarded ? { forwarded: true } : {}),
    ...(media
      ? { mediaUrl: media.url, mediaName: media.name, mediaSize: media.size, mediaMime: media.mime }
      : {}),
    status: "sent",
    readBy: [senderId],
    ...(replyId ? { replyTo: replyId } : {}),
  });

  chat.lastMessage = message._id;
  // New activity un-hides the chat for anyone who had deleted it, so it reappears in their list.
  if ((chat.hiddenFor ?? []).length > 0) chat.set("hiddenFor", []);
  await chat.save();

  if (replyId) await message.populate(REPLY_POPULATE);

  // Notify recipients (best-effort). Self chats skip; groups notify all non-muted members except sender.
  if (groupChat) {
    for (const member of chat.members) {
      const memberId = member.toString();
      if (memberId === senderId) continue;
      const mutedByRecipient = (chat.mutedBy ?? []).some((id) => id.toString() === memberId);
      if (mutedByRecipient) continue;
      void createNotification({
        userId: memberId,
        type: "message",
        actorId: senderId,
        chatId,
        messagePreview: buildMessagePreview(media, content, encrypted),
      });
    }
  } else {
    const otherId = await getOtherMemberId(chat, senderId);
    const mutedByRecipient = (chat.mutedBy ?? []).some((id) => id.toString() === otherId);
    if (!selfChat && !mutedByRecipient) {
      void createNotification({
        userId: otherId,
        type: "message",
        actorId: senderId,
        chatId,
        messagePreview: buildMessagePreview(media, content, encrypted),
      });
    }
  }

  return toMessageDTO(message);
}

/**
 * Write a call-log row into a chat and broadcast it to both members (Sprint 3.1.1). Called by the
 * call signaling layer when a call ends. `callerId` is the message sender; the client renders the
 * direction (outgoing/incoming) by comparing the sender to the viewing user. Best-effort: failures
 * are swallowed so they never break call teardown.
 */
export async function createCallLogMessage(
  chatId: string,
  callerId: string,
  meta: CallLogMeta,
): Promise<void> {
  try {
    const chat = await ChatModel.findById(chatId);
    if (!chat) return;

    const message = await MessageModel.create({
      chatId,
      sender: callerId,
      type: "call",
      call: {
        media: meta.media,
        outcome: meta.outcome,
        ...(typeof meta.durationSec === "number" ? { durationSec: meta.durationSec } : {}),
      },
      status: "sent",
      readBy: [callerId],
    });

    chat.lastMessage = message._id;
    if ((chat.hiddenFor ?? []).length > 0) chat.set("hiddenFor", []);
    await chat.save();

    emitToChatMembers(chat, SOCKET_EVENTS.MESSAGE_NEW, { message: toMessageDTO(message) });
  } catch {
    /* never let call-log persistence break call teardown */
  }
}

/** Edit a message body in place (sender only). Broadcasts to both members. */
export async function editMessage(
  messageId: string,
  userId: string,
  content: string,
  encrypted?: boolean,
): Promise<MessageDTO> {
  const message = await MessageModel.findById(messageId);
  if (!message) throw ApiError.notFound("Message not found");

  const chat = await getChatForUser(String(message.chatId), userId);
  if (isGroupChat(chat) && encrypted) {
    throw ApiError.badRequest("Group messages are not end-to-end encrypted");
  }
  if (String(message.sender) !== userId) {
    throw ApiError.forbidden("NOT_SENDER", "You can only edit your own messages");
  }
  if (message.deletedForEveryone) {
    throw ApiError.badRequest("Cannot edit a deleted message");
  }

  message.content = content;
  message.encrypted = Boolean(encrypted);
  message.editedAt = new Date();
  await message.save();
  await message.populate(REPLY_POPULATE);

  const dto = toMessageDTO(message);
  emitToChatMembers(chat, SOCKET_EVENTS.MESSAGE_EDIT, { message: dto });
  return dto;
}

/** Delete a message for the current user, or for everyone (sender only). */
export async function deleteMessage(
  messageId: string,
  userId: string,
  scope: "me" | "everyone",
): Promise<MessageDTO> {
  const message = await MessageModel.findById(messageId);
  if (!message) throw ApiError.notFound("Message not found");

  const chat = await getChatForUser(String(message.chatId), userId);

  if (scope === "everyone") {
    if (String(message.sender) !== userId) {
      throw ApiError.forbidden("NOT_SENDER", "You can only delete your own messages for everyone");
    }
    message.deletedForEveryone = true;
    message.set("content", undefined);
    message.set("reactions", []);
    await message.save();

    const dto = toMessageDTO(message);
    emitToChatMembers(chat, SOCKET_EVENTS.MESSAGE_DELETE, { message: dto });
    return dto;
  }

  if (!message.deletedFor.some((id) => id.toString() === userId)) {
    message.deletedFor.push(userId as unknown as (typeof message.deletedFor)[number]);
    await message.save();
  }
  return toMessageDTO(message);
}

/** Toggle a single emoji reaction for the current user (empty emoji clears it). */
export async function reactToMessage(
  messageId: string,
  userId: string,
  emoji: string,
): Promise<MessageDTO> {
  const message = await MessageModel.findById(messageId);
  if (!message) throw ApiError.notFound("Message not found");

  const chat = await getChatForUser(String(message.chatId), userId);
  if (!isSelfChat(chat) && !isGroupChat(chat)) {
    const otherId = await getOtherMemberId(chat, userId);
    if (!(await areFriends(userId, otherId))) {
      throw ApiError.forbidden("NOT_FRIENDS", "You must be friends to react");
    }
  }
  if (message.deletedForEveryone) {
    throw ApiError.badRequest("Cannot react to a deleted message");
  }

  const existing = (message.reactions ?? []).find((r) => r.user.toString() === userId);
  const next = (message.reactions ?? [])
    .filter((r) => r.user.toString() !== userId)
    .map((r) => ({ user: r.user, emoji: r.emoji }));
  // Same emoji again = remove (toggle off); different/none = replace.
  if (emoji && existing?.emoji !== emoji) {
    next.push({ user: userId as unknown as (typeof message.reactions)[number]["user"], emoji });
  }
  message.set("reactions", next);
  await message.save();
  await message.populate(REPLY_POPULATE);

  const dto = toMessageDTO(message);
  emitToChatMembers(chat, SOCKET_EVENTS.MESSAGE_REACT, { message: dto });
  return dto;
}

/**
 * Forward a message to a friend (Phase 4). Resolves/creates the 1:1 chat with `targetUserId`
 * (friendship enforced by getOrCreateDirectChat), then re-creates the message there flagged as a
 * forward. For media we copy the stored attachment reference (media isn't E2EE); for text the caller
 * passes a freshly re-encrypted `content` for the target peer (the server can't re-encrypt). Call
 * logs and deleted messages can't be forwarded. Broadcasts MESSAGE_NEW to both members.
 */
export async function forwardMessage(
  messageId: string,
  userId: string,
  options: { targetUserId: string; content?: string; encrypted?: boolean },
): Promise<MessageDTO> {
  const source = await getMessageForUser(messageId, userId);
  if (source.deletedForEveryone) throw ApiError.badRequest("Cannot forward a deleted message");
  if (source.type === "call") throw ApiError.badRequest("Cannot forward a call log");

  const targetChat = await getOrCreateDirectChat(userId, options.targetUserId);
  const targetChatId = targetChat._id.toString();
  const hasMedia = typeof source.mediaUrl === "string" && source.mediaUrl.length > 0;

  let dto: MessageDTO;
  if (hasMedia) {
    dto = await sendMessage(targetChatId, userId, {
      media: {
        type: source.type as MessageType,
        url: source.mediaUrl as string,
        name: typeof source.mediaName === "string" ? source.mediaName : "file",
        size: typeof source.mediaSize === "number" ? source.mediaSize : 0,
        mime: typeof source.mediaMime === "string" ? source.mediaMime : "application/octet-stream",
      },
      ...(options.content ? { content: options.content } : {}),
      forwarded: true,
    });
  } else {
    if (!options.content?.trim()) throw ApiError.badRequest("Nothing to forward");
    dto = await sendMessage(targetChatId, userId, {
      content: options.content,
      encrypted: options.encrypted,
      forwarded: true,
    });
  }

  // Render live for both members (sendMessage persists but doesn't broadcast; mirror the media path).
  const io = getSocketServer();
  if (io) {
    emitToChatMembers(targetChat, SOCKET_EVENTS.MESSAGE_NEW, { message: dto });
  }

  return dto;
}

/** Pin or unpin a chat for the current user (per-user, stored in chat.pinnedBy). */
export async function setChatPinned(chatId: string, userId: string, pinned: boolean): Promise<void> {
  const chat = await getChatForUser(chatId, userId);
  const has = (chat.pinnedBy ?? []).some((id) => id.toString() === userId);
  if (pinned && !has) {
    chat.pinnedBy.push(userId as unknown as (typeof chat.pinnedBy)[number]);
  } else if (!pinned && has) {
    chat.set(
      "pinnedBy",
      chat.pinnedBy.filter((id) => id.toString() !== userId),
    );
  }
  await chat.save();
}

/** Mute or unmute a chat's notifications for the current user (per-user, stored in chat.mutedBy). */
export async function setChatMuted(chatId: string, userId: string, muted: boolean): Promise<void> {
  const chat = await getChatForUser(chatId, userId);
  const list = chat.mutedBy ?? [];
  const has = list.some((id) => id.toString() === userId);
  if (muted && !has) {
    chat.mutedBy.push(userId as unknown as (typeof chat.mutedBy)[number]);
  } else if (!muted && has) {
    chat.set(
      "mutedBy",
      list.filter((id) => id.toString() !== userId),
    );
  }
  await chat.save();
}

/**
 * Archive or unarchive a chat for the current user (per-user, stored in chat.archivedBy). Unlike a
 * "delete" (hiddenFor), archiving is an organizational hide that PERSISTS across new activity — the
 * chat stays in the Archived section until the user explicitly unarchives it.
 */
export async function setChatArchived(chatId: string, userId: string, archived: boolean): Promise<void> {
  const chat = await getChatForUser(chatId, userId);
  const list = chat.archivedBy ?? [];
  const has = list.some((id) => id.toString() === userId);
  if (archived && !has) {
    chat.archivedBy.push(userId as unknown as (typeof chat.archivedBy)[number]);
  } else if (!archived && has) {
    chat.set(
      "archivedBy",
      list.filter((id) => id.toString() !== userId),
    );
  }
  await chat.save();
}

/**
 * Delete a chat for the current user only (per-user soft delete). The user must be a member; we add
 * them to `hiddenFor` so it disappears from THEIR list while the other member keeps full history.
 * Nothing is hard-deleted — new activity (or re-opening the chat) brings it back.
 */
export async function deleteChatForUser(chatId: string, userId: string): Promise<void> {
  const chat = await getChatForUser(chatId, userId);
  if (!(chat.hiddenFor ?? []).some((id) => id.toString() === userId)) {
    chat.hiddenFor.push(userId as unknown as (typeof chat.hiddenFor)[number]);
    await chat.save();
  }
}

export async function deliverAllPendingMessagesForUser(userId: string): Promise<MessageDTO[]> {
  const chats = await ChatModel.find({ members: userId }).select("_id");
  if (chats.length === 0) return [];

  const chatIds = chats.map((c) => c._id);
  const pending = await MessageModel.find({
    chatId: { $in: chatIds },
    sender: { $ne: userId },
    status: "sent",
  });

  const updated: MessageDTO[] = [];
  for (const msg of pending) {
    msg.status = "delivered";
    await msg.save();
    updated.push(toMessageDTO(msg));
  }

  return updated;
}

export async function markMessageDelivered(messageId: string, userId: string): Promise<MessageDTO | null> {
  const message = await MessageModel.findById(messageId);
  if (!message) return null;

  await getChatForUser(String(message.chatId), userId);

  if (String(message.sender) === userId) return toMessageDTO(message);

  if (message.status === "sent") {
    message.status = "delivered";
    await message.save();
  }

  return toMessageDTO(message);
}

/**
 * Mark all of a chat's incoming (sender ≠ userId) "sent" messages as "delivered" and return the
 * updated DTOs. Used by the dev test bot to simulate receiving a human's message (the bot has no
 * browser to emit its own MESSAGE_DELIVERED). No-op for messages already delivered/read.
 */
export async function markIncomingMessagesDelivered(chatId: string, userId: string): Promise<MessageDTO[]> {
  await getChatForUser(chatId, userId);

  const pending = await MessageModel.find({
    chatId,
    sender: { $ne: userId },
    status: "sent",
  });

  const updated: MessageDTO[] = [];
  for (const msg of pending) {
    msg.status = "delivered";
    await msg.save();
    updated.push(toMessageDTO(msg));
  }

  return updated;
}

export async function markMessagesRead(chatId: string, userId: string): Promise<MessageDTO[]> {
  await getChatForUser(chatId, userId);

  const unread = await MessageModel.find({
    chatId,
    sender: { $ne: userId },
    readBy: { $nin: [userId] },
  });

  const updated: MessageDTO[] = [];
  for (const msg of unread) {
    if (!msg.readBy.some((id) => id.toString() === userId)) {
      msg.readBy.push(userId as unknown as typeof msg.readBy[number]);
    }
    msg.status = "read";
    await msg.save();
    updated.push(toMessageDTO(msg));
  }

  return updated;
}

export { getChatForUser, getMessageForUser, getOtherMemberId, toMessageDTO, emitToChatMembers };
export { isGroupChat };
