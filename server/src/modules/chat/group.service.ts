import type { HydratedDocument } from "mongoose";
import { GROUP_MAX_MEMBERS, SOCKET_EVENTS } from "@linkr/shared";
import { ChatModel, type ChatDoc } from "../../models/Chat.js";
import { MessageModel } from "../../models/Message.js";
import { UserModel } from "../../models/User.js";
import { ApiError } from "../../utils/ApiError.js";
import { areFriends } from "../friends/friendship.helpers.js";
import { resolveGroupAvatarUrl } from "../users/avatar.helpers.js";
import { resolveLocalMediaPath, imageMimeForExt } from "./chat.media.service.js";
import path from "node:path";
import { emitToChatMembers, getChatForUser, isGroupChat } from "./chat.service.js";

type ChatDocument = HydratedDocument<ChatDoc>;

function memberIds(chat: ChatDocument): string[] {
  return chat.members.map((m) => m.toString());
}

function adminIds(chat: ChatDocument): string[] {
  return (chat.admins ?? []).map((a) => a.toString());
}

function isAdmin(chat: ChatDocument, userId: string): boolean {
  return adminIds(chat).includes(userId);
}

async function requireGroup(chatId: string, userId: string): Promise<ChatDocument> {
  const chat = await getChatForUser(chatId, userId);
  if (!isGroupChat(chat)) {
    throw ApiError.badRequest("Not a group chat");
  }
  return chat;
}

function requireAdmin(chat: ChatDocument, userId: string): void {
  if (!isAdmin(chat, userId)) {
    throw ApiError.forbidden("NOT_ADMIN", "Only group admins can do this");
  }
}

function pullUserFromChatArrays(chat: ChatDocument, userId: string): void {
  const id = userId as unknown as (typeof chat.members)[number];
  chat.set(
    "members",
    chat.members.filter((m) => m.toString() !== userId),
  );
  chat.set(
    "admins",
    (chat.admins ?? []).filter((a) => a.toString() !== userId),
  );
  chat.set(
    "pinnedBy",
    (chat.pinnedBy ?? []).filter((p) => p.toString() !== userId),
  );
  chat.set(
    "mutedBy",
    (chat.mutedBy ?? []).filter((m) => m.toString() !== userId),
  );
  chat.set(
    "archivedBy",
    (chat.archivedBy ?? []).filter((a) => a.toString() !== userId),
  );
  chat.set(
    "hiddenFor",
    (chat.hiddenFor ?? []).filter((h) => h.toString() !== userId),
  );
  void id;
}

async function notifyGroupUpdated(chat: ChatDocument): Promise<void> {
  emitToChatMembers(chat, SOCKET_EVENTS.GROUP_UPDATED, { chatId: chat._id.toString() });
}

async function deleteGroup(chatId: string, memberIdsBeforeDelete: string[]): Promise<void> {
  await MessageModel.deleteMany({ chatId });
  await ChatModel.findByIdAndDelete(chatId);
  const io = (await import("../../sockets/io.js")).getSocketServer();
  if (!io) return;
  for (const memberId of memberIdsBeforeDelete) {
    io.to(`user:${memberId}`).emit(SOCKET_EVENTS.GROUP_DELETED, { chatId });
  }
}

async function assertCanAddMember(chat: ChatDocument, adminId: string, memberId: string): Promise<void> {
  if (memberIds(chat).includes(memberId)) {
    throw ApiError.badRequest("User is already in this group");
  }
  if (memberIds(chat).length >= GROUP_MAX_MEMBERS) {
    throw ApiError.badRequest(`Groups can have at most ${GROUP_MAX_MEMBERS} members`);
  }
  const user = await UserModel.findById(memberId);
  if (!user?.onboarded) throw ApiError.notFound("User not found");
  if (!(await areFriends(adminId, memberId))) {
    throw ApiError.forbidden("NOT_FRIENDS", "You can only add friends to the group");
  }
}

/** PATCH — rename group (admin). */
export async function updateGroupName(chatId: string, userId: string, name: string): Promise<void> {
  const chat = await requireGroup(chatId, userId);
  requireAdmin(chat, userId);
  chat.name = name.trim();
  await chat.save();
  await notifyGroupUpdated(chat);
}

/** POST multipart — set group avatar ref (admin). */
export async function setGroupAvatar(chatId: string, userId: string, avatarRef: string): Promise<string | undefined> {
  const chat = await requireGroup(chatId, userId);
  requireAdmin(chat, userId);
  chat.avatar = avatarRef;
  await chat.save();
  await notifyGroupUpdated(chat);
  return resolveGroupAvatarUrl(avatarRef, chatId);
}

/** Stream a locally-stored group avatar (member-only). */
export async function getLocalGroupAvatar(
  chatId: string,
  userId: string,
): Promise<{ filePath: string; mime: string } | null> {
  const chat = await requireGroup(chatId, userId);
  const ref = typeof chat.avatar === "string" ? chat.avatar : "";
  if (!ref) return null;
  const filePath = await resolveLocalMediaPath(ref);
  if (!filePath) return null;
  return { filePath, mime: imageMimeForExt(path.extname(ref)) };
}

/** POST — add a friend to the group (admin). */
export async function addGroupMember(chatId: string, adminId: string, memberId: string): Promise<void> {
  const chat = await requireGroup(chatId, adminId);
  requireAdmin(chat, adminId);
  if (memberId === adminId) throw ApiError.badRequest("You are already in this group");
  await assertCanAddMember(chat, adminId, memberId);
  chat.members.push(memberId as unknown as (typeof chat.members)[number]);
  await chat.save();
  await notifyGroupUpdated(chat);
}

/** DELETE — remove a member (admin; not self — use leave). */
export async function removeGroupMember(chatId: string, adminId: string, targetUserId: string): Promise<void> {
  const chat = await requireGroup(chatId, adminId);
  requireAdmin(chat, adminId);
  if (targetUserId === adminId) {
    throw ApiError.badRequest("Use leave group to remove yourself");
  }
  if (!memberIds(chat).includes(targetUserId)) {
    throw ApiError.notFound("Member not in this group");
  }
  pullUserFromChatArrays(chat, targetUserId);
  await chat.save();
  await notifyGroupUpdated(chat);
}

/** POST — promote a member to admin (admin). */
export async function promoteGroupAdmin(chatId: string, adminId: string, targetUserId: string): Promise<void> {
  const chat = await requireGroup(chatId, adminId);
  requireAdmin(chat, adminId);
  if (!memberIds(chat).includes(targetUserId)) {
    throw ApiError.notFound("Member not in this group");
  }
  if (isAdmin(chat, targetUserId)) return;
  chat.admins.push(targetUserId as unknown as (typeof chat.admins)[number]);
  await chat.save();
  await notifyGroupUpdated(chat);
}

/** DELETE — demote an admin (admin; cannot demote last admin). */
export async function demoteGroupAdmin(chatId: string, adminId: string, targetUserId: string): Promise<void> {
  const chat = await requireGroup(chatId, adminId);
  requireAdmin(chat, adminId);
  if (!isAdmin(chat, targetUserId)) return;
  const admins = adminIds(chat);
  if (admins.length <= 1) {
    throw ApiError.badRequest("Cannot demote the only admin");
  }
  chat.set(
    "admins",
    (chat.admins ?? []).filter((a) => a.toString() !== targetUserId),
  );
  await chat.save();
  await notifyGroupUpdated(chat);
}

/** PATCH — who may send messages (admin). */
export async function updateGroupMessagePermission(
  chatId: string,
  userId: string,
  messagePermission: "everyone" | "admins",
): Promise<void> {
  const chat = await requireGroup(chatId, userId);
  requireAdmin(chat, userId);
  chat.messagePermission = messagePermission;
  await chat.save();
  await notifyGroupUpdated(chat);
}

/**
 * POST — leave a group. Sole admin with other members must pass `newAdminId` or promote someone first.
 * Last member deletes the group.
 */
export async function leaveGroup(
  chatId: string,
  userId: string,
  options?: { newAdminId?: string },
): Promise<{ deleted: boolean }> {
  const chat = await requireGroup(chatId, userId);
  const members = memberIds(chat);
  const admins = adminIds(chat);
  const isUserAdmin = admins.includes(userId);
  const others = members.filter((id) => id !== userId);

  if (others.length === 0) {
    await deleteGroup(chatId, members);
    return { deleted: true };
  }

  if (isUserAdmin && admins.length === 1) {
    const successor = options?.newAdminId?.trim();
    if (!successor) {
      throw ApiError.badRequest(
        "LAST_ADMIN",
        "Promote another admin before leaving, or choose someone to take over",
      );
    }
    if (!others.includes(successor)) {
      throw ApiError.badRequest("Successor must be a member of this group");
    }
    chat.admins.push(successor as unknown as (typeof chat.admins)[number]);
  }

  pullUserFromChatArrays(chat, userId);
  await chat.save();
  await notifyGroupUpdated(chat);
  return { deleted: false };
}
