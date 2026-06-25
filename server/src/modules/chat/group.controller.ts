import type { Request } from "express";
import type { AddGroupMemberInput, LeaveGroupInput, UpdateGroupInput } from "@linkr/shared";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { storeMedia, validateAvatarUpload } from "./chat.media.service.js";
import {
  addGroupMember,
  demoteGroupAdmin,
  getLocalGroupAvatar,
  leaveGroup,
  promoteGroupAdmin,
  removeGroupMember,
  setGroupAvatar,
  updateGroupName,
} from "./group.service.js";
import { listGroupMembersForChat } from "./chat.service.js";

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

/** GET /api/chat/group/:chatId/members — full member roster (lazy; not in GET /chat list). */
export const getGroupMembers = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  if (!chatId) throw ApiError.badRequest("Missing chatId");
  const members = await listGroupMembersForChat(chatId, requireUserId(req));
  res.status(200).json({ members });
});

/** PATCH /api/chat/group/:chatId — rename group (admin). */
export const patchGroup = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  if (!chatId) throw ApiError.badRequest("Missing chatId");
  const { name } = req.body as UpdateGroupInput;
  await updateGroupName(chatId, requireUserId(req), name);
  res.status(200).json({ ok: true, name: name.trim() });
});

/** POST /api/chat/group/:chatId/avatar — upload group photo (admin). */
export const postGroupAvatar = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  if (!chatId) throw ApiError.badRequest("Missing chatId");
  const file = req.file;
  if (!file) throw ApiError.badRequest("No image uploaded");

  const validated = validateAvatarUpload(file.originalname, file.buffer);
  const ref = await storeMedia(validated, file.buffer);
  const avatarUrl = await setGroupAvatar(chatId, requireUserId(req), ref);
  res.status(200).json({ ok: true, avatarUrl });
});

/** GET /api/chat/group/:chatId/avatar — stream locally-stored group avatar. */
export const getGroupAvatar = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  if (!chatId) throw ApiError.badRequest("Missing chatId");
  const found = await getLocalGroupAvatar(chatId, requireUserId(req));
  if (!found) throw ApiError.notFound("Avatar not found");

  res.setHeader("Content-Type", found.mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=300");
  res.sendFile(found.filePath);
});

/** POST /api/chat/group/:chatId/members — add friend (admin). */
export const postGroupMember = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  if (!chatId) throw ApiError.badRequest("Missing chatId");
  const { userId } = req.body as AddGroupMemberInput;
  await addGroupMember(chatId, requireUserId(req), userId);
  res.status(200).json({ ok: true });
});

/** DELETE /api/chat/group/:chatId/members/:userId — remove member (admin). */
export const deleteGroupMember = asyncHandler(async (req, res) => {
  const { chatId, userId: targetUserId } = req.params;
  if (!chatId || !targetUserId) throw ApiError.badRequest("Missing chatId or userId");
  await removeGroupMember(chatId, requireUserId(req), targetUserId);
  res.status(200).json({ ok: true });
});

/** POST /api/chat/group/:chatId/admins/:userId — promote to admin. */
export const postGroupAdmin = asyncHandler(async (req, res) => {
  const { chatId, userId: targetUserId } = req.params;
  if (!chatId || !targetUserId) throw ApiError.badRequest("Missing chatId or userId");
  await promoteGroupAdmin(chatId, requireUserId(req), targetUserId);
  res.status(200).json({ ok: true });
});

/** DELETE /api/chat/group/:chatId/admins/:userId — demote admin. */
export const deleteGroupAdmin = asyncHandler(async (req, res) => {
  const { chatId, userId: targetUserId } = req.params;
  if (!chatId || !targetUserId) throw ApiError.badRequest("Missing chatId or userId");
  await demoteGroupAdmin(chatId, requireUserId(req), targetUserId);
  res.status(200).json({ ok: true });
});

/** POST /api/chat/group/:chatId/leave — leave group (sole admin may pass newAdminId). */
export const postLeaveGroup = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  if (!chatId) throw ApiError.badRequest("Missing chatId");
  const { newAdminId } = (req.body ?? {}) as LeaveGroupInput;
  const result = await leaveGroup(chatId, requireUserId(req), { newAdminId });
  res.status(200).json({ ok: true, ...result });
});
