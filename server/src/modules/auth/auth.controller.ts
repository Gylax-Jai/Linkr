import type { Request } from "express";
import type { AuthResponse, OtpSendResponse } from "@linkr/shared";
import {
  clearRefreshCookie,
  REFRESH_COOKIE_NAME,
  setRefreshCookie,
} from "../../config/cookies.js";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../utils/jwt.js";
import { getUserById, loginWithGoogle, toSessionUser, type UserDocument } from "./auth.service.js";
import { bindVerifiedPhone, sendOtp, verifyOtp } from "./otp.service.js";
import { verifyMsg91AccessToken } from "./msg91.service.js";

/** Issue an access token + set the refresh cookie, returning the standard auth response. */
function issueSession(res: Parameters<typeof setRefreshCookie>[0], user: UserDocument): AuthResponse {
  setRefreshCookie(res, signRefreshToken(user.id));
  return { user: toSessionUser(user), accessToken: signAccessToken(user.id) };
}

function requireUser(req: Request): UserDocument {
  if (!req.user) throw ApiError.unauthorized();
  return req.user;
}

/** POST /api/auth/google — verify the Google ID token, find-or-create the user, start a session. */
export const googleLogin = asyncHandler(async (req, res) => {
  const { idToken } = req.body as { idToken: string };
  const user = await loginWithGoogle(idToken);
  res.status(200).json(issueSession(res, user));
});

/** POST /api/auth/refresh — exchange a valid refresh cookie for a fresh access token (rotates refresh). */
export const refresh = asyncHandler(async (req, res) => {
  const token = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME];
  if (!token) throw ApiError.unauthorized("Session expired");

  let userId: string;
  try {
    userId = verifyRefreshToken(token);
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }

  const user = await getUserById(userId);
  if (!user) {
    clearRefreshCookie(res);
    throw ApiError.unauthorized("Session expired");
  }

  res.status(200).json(issueSession(res, user));
});

/** POST /api/auth/logout — clear the refresh cookie. */
export const logout = asyncHandler(async (_req, res) => {
  clearRefreshCookie(res);
  res.status(200).json({ success: true });
});

/** GET /api/auth/me — the current authenticated user (requireAuth). */
export const me = asyncHandler(async (req, res) => {
  res.status(200).json({ user: toSessionUser(requireUser(req)) });
});

/** POST /api/auth/otp/send — generate + (mock) deliver a phone OTP (requireAuth). */
export const otpSend = asyncHandler(async (req, res) => {
  const { phone } = req.body as { phone: string };
  const result = await sendOtp(requireUser(req), phone);
  const response: OtpSendResponse = {
    sent: true,
    expiresInMs: result.expiresInMs,
    ...(result.devCode ? { devCode: result.devCode } : {}),
  };
  res.status(200).json(response);
});

/** POST /api/auth/otp/verify — verify a code and bind the encrypted phone to the user (requireAuth). */
export const otpVerify = asyncHandler(async (req, res) => {
  const { phone, code } = req.body as { phone: string; code: string };
  await verifyOtp(requireUser(req), phone, code);
  res.status(200).json({ verified: true });
});

/**
 * POST /api/auth/otp/msg91-verify — verify a MSG91 widget access token (the widget already sent +
 * verified the SMS code client-side), read the trusted phone from MSG91, and bind it to the user.
 */
export const otpMsg91Verify = asyncHandler(async (req, res) => {
  const { accessToken } = req.body as { accessToken: string };
  const phone = await verifyMsg91AccessToken(accessToken);
  await bindVerifiedPhone(requireUser(req), phone);
  res.status(200).json({ verified: true });
});
