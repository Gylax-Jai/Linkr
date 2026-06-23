import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ApiError } from "./ApiError.js";

/**
 * Linkr session tokens (blueprint §4). Short-lived access token returned to the client,
 * long-lived refresh token delivered as an HttpOnly cookie. Secrets come from env only;
 * if they are missing we fail clearly at call time (500) rather than crashing at boot.
 */

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export type TokenKind = "access" | "refresh";

interface LinkrTokenPayload {
  sub: string;
  kind: TokenKind;
  /** Session/device id (Sprint E). Ties the token to a revocable server-side Session record. */
  sid?: string;
}

/** Verified token result: the user id plus the session id it was minted for (when present). */
export interface VerifiedToken {
  userId: string;
  sessionId?: string;
}

function secretFor(kind: TokenKind): string {
  const secret = kind === "access" ? env.JWT_ACCESS_SECRET : env.JWT_REFRESH_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw ApiError.internal("JWT secrets are not configured (set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET)");
  }
  return secret;
}

export function signAccessToken(userId: string, sessionId?: string): string {
  return jwt.sign(
    { sub: userId, kind: "access", ...(sessionId ? { sid: sessionId } : {}) } satisfies LinkrTokenPayload,
    secretFor("access"),
    { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
  );
}

export function signRefreshToken(userId: string, sessionId?: string): string {
  return jwt.sign(
    { sub: userId, kind: "refresh", ...(sessionId ? { sid: sessionId } : {}) } satisfies LinkrTokenPayload,
    secretFor("refresh"),
    { expiresIn: REFRESH_TOKEN_TTL_SECONDS },
  );
}

/** Verify a token of the given kind and return the user + session id. Throws 401 on any failure. */
function verify(token: string, kind: TokenKind): VerifiedToken {
  try {
    const decoded = jwt.verify(token, secretFor(kind));
    if (typeof decoded === "string" || decoded.kind !== kind || typeof decoded.sub !== "string") {
      throw ApiError.unauthorized("Invalid token");
    }
    return {
      userId: decoded.sub,
      sessionId: typeof decoded.sid === "string" ? decoded.sid : undefined,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw ApiError.unauthorized("Invalid or expired token");
  }
}

export function verifyAccessToken(token: string): VerifiedToken {
  return verify(token, "access");
}

export function verifyRefreshToken(token: string): VerifiedToken {
  return verify(token, "refresh");
}
