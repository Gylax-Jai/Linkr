import type { CookieOptions, Response } from "express";
import { env } from "./env.js";
import { REFRESH_TOKEN_TTL_SECONDS } from "../utils/jwt.js";

/**
 * Refresh-token cookie (blueprint §4 / security rules). HttpOnly so JS can never read it;
 * scoped to the auth routes that actually need it. In dev over http we use SameSite=Lax +
 * secure:false; in production (cross-site deploy) SameSite=None + secure:true.
 */
export const REFRESH_COOKIE_NAME = "linkr_refresh";

const REFRESH_COOKIE_PATH = "/api/auth";

function baseOptions(): CookieOptions {
  const isProd = env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: REFRESH_COOKIE_PATH,
  };
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...baseOptions(),
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions());
}
