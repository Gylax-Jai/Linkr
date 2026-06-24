import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";
import { logger } from "../utils/logger.js";

// Load the single root-level .env (this file lives at server/src/config/env.ts).
const here = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(here, "../../../.env");
dotenv.config({ path: rootEnvPath });

/**
 * Env schema. In Sprint 0 every external credential is OPTIONAL so the app boots without
 * MongoDB/Redis/Google. Validation here only guards shape/format and supplies safe defaults;
 * secrets are NEVER hardcoded — they come from the environment only.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_URL: z.string().url().default("http://localhost:5173"),

  MONGODB_URI: z.string().optional(),
  REDIS_URL: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  CLOUDINARY_URL: z.string().optional(),
  /** @deprecated Legacy placeholder. Real SMS now uses the MSG91 OTP widget (MSG91_AUTH_KEY). */
  OTP_PROVIDER_KEY: z.string().optional(),

  /**
   * MSG91 account Authkey — server-only. Used to verify the access token returned by the client-side
   * MSG91 OTP widget (https://docs.msg91.com/otp-widget/verify-access-token). Never expose to the
   * client; only the widget id + widget token (VITE_MSG91_*) are public. Supply via env only.
   */
  MSG91_AUTH_KEY: z.string().optional(),

  /**
   * Dev/testing only: enables the auto-replying `@linkr_bot` account so chat can be tested
   * without a second login. Defaults ON; set to "false" to disable (required before E2EE).
   */
  ENABLE_TEST_BOT: z.string().optional(),

  /**
   * Optional 32+ char secret used to derive the AES-256-GCM key + HMAC key for encrypting
   * phone numbers at rest (blueprint §4). Falls back to JWT_ACCESS_SECRET when unset so the
   * app works without extra setup. NEVER hardcode this — supply via the environment.
   */
  PHONE_ENC_KEY: z.string().optional(),

  /**
   * Phase 3 calls — WebRTC ICE servers. STUN is enough on most networks; TURN relays media when
   * peers are behind strict NAT/firewalls. Credentials are NEVER hardcoded — supply via env only
   * and serve them via GET /api/calls/ice-config (Cache-Control: no-store).
   *
   * Two TURN modes (pick one):
   * - **Static** (Metered / Open Relay): TURN_URLS + TURN_USERNAME + TURN_CREDENTIAL
   * - **coturn REST**: TURN_URLS + TURN_SECRET (HMAC-minted per-user credentials)
   */
  /** Comma-separated STUN urls. Defaults to Google's public STUN when unset. */
  STUN_URLS: z.string().optional(),
  /** Comma-separated TURN urls, e.g. turn:global.relay.metered.ca:443,turns:global.relay.metered.ca:443?transport=tcp */
  TURN_URLS: z.string().optional(),
  /** Managed TURN (Metered etc.): fixed username from the provider dashboard. Server-only. */
  TURN_USERNAME: z.string().optional(),
  /** Managed TURN (Metered etc.): fixed password/credential from the provider dashboard. Server-only. */
  TURN_CREDENTIAL: z.string().optional(),
  /** coturn static-auth-secret used to derive time-limited TURN credentials. Server-only. */
  TURN_SECRET: z.string().optional(),
  /** Lifetime (seconds) of minted TURN credentials (coturn mode). Default 1 hour. */
  TURN_TTL: z.coerce.number().int().positive().default(3600),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  logger.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration — check your .env against .env.example");
}

export const env = parsed.data;
export type Env = typeof env;

/** True only when a value is present and non-empty. */
function has(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const turnCoturn = has(env.TURN_URLS) && has(env.TURN_SECRET);
const turnStatic =
  has(env.TURN_URLS) && has(env.TURN_USERNAME) && has(env.TURN_CREDENTIAL);

export const features = {
  mongo: has(env.MONGODB_URI),
  redis: has(env.REDIS_URL),
  googleAuth: has(env.GOOGLE_CLIENT_ID) && has(env.GOOGLE_CLIENT_SECRET),
  /** ID-token login only needs the client ID (no client secret) — blueprint §4 / Sprint 1. */
  googleIdToken: has(env.GOOGLE_CLIENT_ID),
  /** JWT sessions require both signing secrets to be present. */
  jwt: has(env.JWT_ACCESS_SECRET) && has(env.JWT_REFRESH_SECRET),
  /** Auto-replying test bot — on unless explicitly disabled. Never enable in production. */
  testBot: env.NODE_ENV !== "production" && env.ENABLE_TEST_BOT !== "false",
  /** MSG91 OTP widget verification — server re-verifies the widget's access token when set. */
  msg91: has(env.MSG91_AUTH_KEY),
  /** Self-hosted coturn with REST API credential minting. */
  turnCoturn,
  /** Managed TURN with fixed username/password (e.g. Metered Open Relay). */
  turnStatic,
  /** TURN relay enabled in either mode. */
  turn: turnCoturn || turnStatic,
};
