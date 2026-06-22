import type { Request } from "express";
import type { PublishKeyInput, PublicKeyResponse } from "@linkr/shared";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getPublicKey, publishPublicKey } from "./keys.service.js";

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

/** POST /api/keys — publish or rotate the current user's E2EE public key. */
export const publishKey = asyncHandler(async (req, res) => {
  const { publicKey } = req.body as PublishKeyInput;
  await publishPublicKey(requireUserId(req), publicKey);
  res.status(204).end();
});

/** GET /api/keys/:userId — fetch a user's public key (self or friends only). */
export const getKey = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  if (!userId) throw ApiError.badRequest("Missing userId");
  const publicKey = await getPublicKey(requireUserId(req), userId);
  const body: PublicKeyResponse = { userId, publicKey };
  res.status(200).json(body);
});
