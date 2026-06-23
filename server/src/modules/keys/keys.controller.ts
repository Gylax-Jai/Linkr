import type { Request } from "express";
import type {
  KeyBackupResponse,
  PublishKeyInput,
  PublicKeyResponse,
  UploadKeyBackupInput,
} from "@linkr/shared";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getKeyBackup, getPublicKey, publishPublicKey, saveKeyBackup } from "./keys.service.js";

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

/** GET /api/keys/backup — fetch the caller's own encrypted account-key backup (Sprint D). */
export const getMyBackup = asyncHandler(async (req, res) => {
  const body: KeyBackupResponse = await getKeyBackup(requireUserId(req));
  res.status(200).json(body);
});

/** PUT /api/keys/backup — store/replace the caller's account public key + encrypted backup. */
export const putMyBackup = asyncHandler(async (req, res) => {
  const { publicKey, backup } = req.body as UploadKeyBackupInput;
  await saveKeyBackup(requireUserId(req), publicKey, backup);
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
