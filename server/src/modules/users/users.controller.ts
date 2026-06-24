import type { Request } from "express";
import type {
  DeleteAccountInput,
  OnboardingInput,
  PrivacyUpdateInput,
  ProfileUpdateInput,
  ReportUserInput,
  UserIdParam,
  UsernameAvailability,
} from "@linkr/shared";
import { clearRefreshCookie } from "../../config/cookies.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { toSessionUser, type UserDocument } from "../auth/auth.service.js";
import { storeMedia, validateAvatarUpload } from "../chat/chat.media.service.js";
import { deactivateAccount, purgeUser } from "./account.service.js";
import {
  completeOnboarding,
  getLocalAvatar,
  isUsernameAvailable,
  reportUser as reportUserService,
  searchUsersByUsername,
  setUserAvatar,
  updatePrivacy,
  updateProfile,
} from "./users.service.js";

function requireUser(req: Request): UserDocument {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

/** GET /api/users/username-available?username= — live availability check for onboarding. */
export const usernameAvailable = asyncHandler(async (req, res) => {
  const { username } = req.query as { username: string };
  const available = await isUsernameAvailable(username, requireUser(req).id);
  const response: UsernameAvailability = { available };
  res.status(200).json(response);
});

/** POST /api/users/onboarding — finalize profile + username (requires a verified phone). */
export const onboarding = asyncHandler(async (req, res) => {
  const input = req.body as OnboardingInput;
  const user = await completeOnboarding(requireUser(req), input);
  res.status(200).json({ user: toSessionUser(user) });
});

/** GET /api/users/search?q= — privacy-limited username search. */
export const searchUsers = asyncHandler(async (req, res) => {
  const { q } = req.query as { q: string };
  const results = await searchUsersByUsername(q, requireUser(req).id);
  res.status(200).json({ results });
});

/** PATCH /api/users/me/privacy — update privacy settings. */
export const updateUserPrivacy = asyncHandler(async (req, res) => {
  const input = req.body as PrivacyUpdateInput;
  const user = await updatePrivacy(requireUser(req), input);
  res.status(200).json({ user: toSessionUser(user) });
});

/** POST /api/users/:userId/report — file a report against another user (Phase 4). */
export const reportUser = asyncHandler(async (req, res) => {
  const { userId } = req.params as UserIdParam;
  const input = req.body as ReportUserInput;
  await reportUserService(requireUser(req).id, userId, input);
  res.status(201).json({ ok: true });
});

/** PATCH /api/users/me — update displayName, bio, status (username is immutable). */
export const updateMe = asyncHandler(async (req, res) => {
  const input = req.body as ProfileUpdateInput;
  const user = await updateProfile(requireUser(req), input);
  res.status(200).json({ user: toSessionUser(user) });
});

/**
 * POST /api/users/me/delete — delete the account (Phase 4). `mode: "scheduled"` soft-deletes with a
 * 15-day grace window (reversible by logging back in); `mode: "immediate"` purges everything now.
 * Guarded by a typed confirmation that must match the user's @username (or email). Either way we
 * clear the refresh cookie so this device is signed out; the client then drops its access token.
 */
export const deleteAccount = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const { mode, confirm } = req.body as DeleteAccountInput;

  const expected = (user.username ?? user.email).trim().toLowerCase();
  if (confirm.trim().toLowerCase() !== expected) {
    throw ApiError.badRequest("Confirmation doesn't match your username");
  }

  if (mode === "immediate") {
    await purgeUser(user.id);
    clearRefreshCookie(res);
    res.status(200).json({ ok: true, purged: true });
    return;
  }

  const scheduledPurgeAt = await deactivateAccount(user.id);
  clearRefreshCookie(res);
  res.status(200).json({ ok: true, scheduledPurgeAt: scheduledPurgeAt.toISOString() });
});

/**
 * POST /api/users/me/avatar — upload a profile photo (multipart `file`). Reuses the chat-media
 * hardening: images only, ≤ 5 MB, magic-byte verified, random storage filename, Cloudinary or
 * local-disk (served via the authenticated route below). Returns the refreshed session user.
 */
export const updateAvatar = asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw ApiError.badRequest("No image uploaded");

  const validated = validateAvatarUpload(file.originalname, file.buffer);
  const ref = await storeMedia(validated, file.buffer);
  const user = await setUserAvatar(requireUser(req), ref);
  res.status(200).json({ user: toSessionUser(user) });
});

/**
 * GET /api/users/avatar/:userId — authenticated stream of a locally-stored avatar. Cloudinary
 * avatars are served directly by Cloudinary instead (absolute URLs never hit this route).
 */
export const getAvatar = asyncHandler(async (req, res) => {
  const { userId } = req.params as UserIdParam;
  const found = await getLocalAvatar(userId);
  if (!found) throw ApiError.notFound("Avatar not found");

  res.setHeader("Content-Type", found.mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=300");
  res.sendFile(found.filePath);
});
