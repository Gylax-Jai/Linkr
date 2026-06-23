import type { Request } from "express";
import type { SessionListResponse } from "@linkr/shared";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { listSessions, revokeOtherSessions, revokeSession } from "./sessions.service.js";

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

/**
 * Mutations must know which device is "current" to avoid revoking it by accident. The current id
 * lives in the access token (`req.sessionId`); a token minted before Sprint E won't carry one, so we
 * ask the user to sign in again rather than guess.
 */
function requireCurrentSession(req: Request): string {
  if (!req.sessionId) {
    throw ApiError.unauthorized("Please sign in again to manage your devices");
  }
  return req.sessionId;
}

/** GET /api/sessions — list the current account's signed-in devices. */
export const getSessions = asyncHandler(async (req, res) => {
  const body: SessionListResponse = { sessions: await listSessions(requireUserId(req), req.sessionId) };
  res.status(200).json(body);
});

/** DELETE /api/sessions/others — sign out every device except the current one. */
export const deleteOtherSessions = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const current = requireCurrentSession(req);
  const revoked = await revokeOtherSessions(userId, current);
  res.status(200).json({ revoked });
});

/** DELETE /api/sessions/:id — revoke one device (its next token refresh then fails). */
export const deleteSessionById = asyncHandler(async (req, res) => {
  const userId = requireUserId(req);
  const { id } = req.params;
  if (!id) throw ApiError.badRequest("Missing session id");
  const result = await revokeSession(userId, id, req.sessionId);
  res.status(200).json(result);
});
