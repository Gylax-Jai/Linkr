import type { Request } from "express";
import type { FriendRequestBody, FriendshipIdParam, UserIdParam } from "@linkr/shared";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import type { UserDocument } from "../auth/auth.service.js";
import {
  acceptFriendRequest,
  blockUser,
  cancelFriendRequest,
  listFriends,
  listPendingRequests,
  rejectFriendRequest,
  removeFriend,
  sendFriendRequest,
  unblockUser,
} from "./friends.service.js";

function requireUser(req: Request): UserDocument {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

export const sendRequest = asyncHandler(async (req, res) => {
  const { recipientId } = req.body as FriendRequestBody;
  const result = await sendFriendRequest(requireUser(req), recipientId);
  res.status(201).json(result);
});

export const acceptRequest = asyncHandler(async (req, res) => {
  const { friendshipId } = req.params as FriendshipIdParam;
  const result = await acceptFriendRequest(requireUser(req).id, friendshipId);
  res.status(200).json(result);
});

export const rejectRequest = asyncHandler(async (req, res) => {
  const { friendshipId } = req.params as FriendshipIdParam;
  const result = await rejectFriendRequest(requireUser(req).id, friendshipId);
  res.status(200).json(result);
});

export const cancelRequest = asyncHandler(async (req, res) => {
  const { friendshipId } = req.params as FriendshipIdParam;
  await cancelFriendRequest(requireUser(req).id, friendshipId);
  res.status(204).end();
});

export const block = asyncHandler(async (req, res) => {
  const { userId } = req.params as UserIdParam;
  const result = await blockUser(requireUser(req).id, userId);
  res.status(200).json(result);
});

export const unblock = asyncHandler(async (req, res) => {
  const { userId } = req.params as UserIdParam;
  const result = await unblockUser(requireUser(req).id, userId);
  res.status(200).json(result);
});

export const remove = asyncHandler(async (req, res) => {
  const { userId } = req.params as UserIdParam;
  const result = await removeFriend(requireUser(req).id, userId);
  res.status(200).json(result);
});

export const getFriends = asyncHandler(async (req, res) => {
  const result = await listFriends(requireUser(req).id);
  res.status(200).json(result);
});

export const getPending = asyncHandler(async (req, res) => {
  const result = await listPendingRequests(requireUser(req).id);
  res.status(200).json(result);
});
