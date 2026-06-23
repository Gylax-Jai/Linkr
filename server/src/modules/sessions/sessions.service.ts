import type { Request } from "express";
import { isValidObjectId } from "mongoose";
import type { DeviceSession } from "@linkr/shared";
import { SessionModel } from "../../models/Session.js";
import { ApiError } from "../../utils/ApiError.js";

/**
 * Session/device service (Sprint E). Owns the lifecycle of server-side login sessions so users can
 * see their signed-in devices and remotely revoke them. A session's existence is the source of truth
 * for whether a refresh token is still valid (see auth.controller `refresh`).
 */

/** Best-effort client IP. Relies on Express `trust proxy` for `req.ip` behind a reverse proxy. */
function clientIp(req: Request): string | undefined {
  return req.ip ?? undefined;
}

function userAgentOf(req: Request): string {
  return (req.header("user-agent") ?? "").slice(0, 400);
}

/**
 * Derive a friendly "Browser on OS" label from a user-agent string using simple, dependency-free
 * substring checks. Order matters (e.g. Edge/Chrome both contain "Chrome"; check Edge first).
 */
export function deviceLabelFromUA(ua: string | undefined): string {
  if (!ua) return "Unknown device";

  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : "Browser";

  const os =
    /Windows/.test(ua) ? "Windows"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux"
    : "device";

  return `${browser} on ${os}`;
}

/** Create a session row for a fresh login and return its id (embedded into the issued tokens). */
export async function createSession(userId: string, req: Request): Promise<string> {
  const ua = userAgentOf(req);
  const session = await SessionModel.create({
    user: userId,
    label: deviceLabelFromUA(ua),
    userAgent: ua,
    ip: clientIp(req),
    lastSeenAt: new Date(),
  });
  return session.id;
}

/**
 * Mark a session active (on token refresh) and refresh its metadata. Returns false when the session
 * no longer exists — i.e. it was revoked remotely — so the caller can reject the refresh.
 */
export async function touchSession(sessionId: string, req: Request): Promise<boolean> {
  if (!isValidObjectId(sessionId)) return false;
  const result = await SessionModel.updateOne(
    { _id: sessionId },
    { $set: { lastSeenAt: new Date(), ip: clientIp(req), userAgent: userAgentOf(req) } },
  );
  return result.matchedCount > 0;
}

/** Delete a session by id without an ownership check — used at logout with an id from a signed token. */
export async function deleteSession(sessionId: string): Promise<void> {
  if (!isValidObjectId(sessionId)) return;
  await SessionModel.deleteOne({ _id: sessionId });
}

/** List the user's sessions (newest activity first), flagging which one is the current device. */
export async function listSessions(
  userId: string,
  currentSessionId: string | undefined,
): Promise<DeviceSession[]> {
  const sessions = await SessionModel.find({ user: userId }).sort({ lastSeenAt: -1 }).lean();
  return sessions.map((s) => ({
    _id: String(s._id),
    label: s.label,
    current: currentSessionId ? String(s._id) === currentSessionId : false,
    lastSeenAt: (s.lastSeenAt ?? s.createdAt ?? new Date()).toISOString(),
    createdAt: (s.createdAt ?? new Date()).toISOString(),
  }));
}

/** Revoke one of the user's sessions. Returns whether the revoked one was the current device. */
export async function revokeSession(
  userId: string,
  sessionId: string,
  currentSessionId: string | undefined,
): Promise<{ current: boolean }> {
  if (!isValidObjectId(sessionId)) throw ApiError.notFound("Session not found");
  const result = await SessionModel.deleteOne({ _id: sessionId, user: userId });
  if (result.deletedCount === 0) throw ApiError.notFound("Session not found");
  return { current: sessionId === currentSessionId };
}

/** Revoke every session for the user EXCEPT the current device. Returns how many were removed. */
export async function revokeOtherSessions(
  userId: string,
  currentSessionId: string,
): Promise<number> {
  const result = await SessionModel.deleteMany({ user: userId, _id: { $ne: currentSessionId } });
  return result.deletedCount ?? 0;
}
