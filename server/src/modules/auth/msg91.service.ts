import { PHONE_E164_REGEX } from "@linkr/shared";
import { env, features } from "../../config/env.js";
import { ApiError } from "../../utils/ApiError.js";
import { logger } from "../../utils/logger.js";

/**
 * MSG91 OTP widget verification (Phase 8 — real SMS OTP). The client-side widget sends + verifies
 * the code and hands the browser a short-lived JWT "access token". We re-verify that token here with
 * our server-only Authkey and read the TRUSTED phone number from MSG91's response — the client never
 * asserts its own phone. See https://docs.msg91.com/otp-widget/verify-access-token.
 */

const VERIFY_URL = "https://control.msg91.com/api/v5/widget/verifyAccessToken";
const REQUEST_TIMEOUT_MS = 10_000;

/** MSG91 returns identifiers like `919876543210` (no `+`); normalize to E.164 (`+91...`). */
function normalizePhoneToE164(raw: string): string | null {
  const trimmed = raw.trim();
  const e164 = trimmed.startsWith("+") ? trimmed : `+${trimmed.replace(/\D/g, "")}`;
  return PHONE_E164_REGEX.test(e164) ? e164 : null;
}

/** Recursively scan a loosely-typed object for the first phone-like value (depth-limited). */
function findPhoneDeep(value: unknown, depth = 0): string | null {
  if (depth > 4 || value == null) return null;
  if (typeof value === "string") return normalizePhoneToE164(value);
  if (typeof value === "number") return normalizePhoneToE164(String(value));
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPhoneDeep(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // Prefer known phone-ish keys first so we don't grab unrelated numeric fields.
    for (const key of ["mobile", "identifier", "phone", "number", "msisdn"]) {
      if (key in obj) {
        const found = findPhoneDeep(obj[key], depth + 1);
        if (found) return found;
      }
    }
    for (const v of Object.values(obj)) {
      const found = findPhoneDeep(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** Decode a JWT payload (no signature check — we trust it only after MSG91 validated the token). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  const payloadPart = parts[1];
  if (parts.length !== 3 || !payloadPart) return null;
  try {
    const json = Buffer.from(payloadPart.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Pull a phone-like value out of MSG91's verify response, falling back to the JWT access-token
 * payload (which carries the verified identifier) when the HTTP body doesn't expose it directly.
 */
function extractPhone(body: unknown, accessToken: string): string | null {
  const fromBody = findPhoneDeep(body);
  if (fromBody) return fromBody;
  const payload = decodeJwtPayload(accessToken);
  return payload ? findPhoneDeep(payload) : null;
}

interface Msg91Result {
  /** HTTP ok AND MSG91 didn't report an error/failure type. */
  success: boolean;
  status: number;
  body: unknown;
  /** MSG91's `message`/error text, when present. */
  message: string | null;
}

/** Make one verifyAccessToken call with the given encoding. */
async function callVerify(accessToken: string, encoding: "json" | "form"): Promise<Msg91Result> {
  const authkey = env.MSG91_AUTH_KEY as string;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": encoding === "json" ? "application/json" : "application/x-www-form-urlencoded",
        Accept: "application/json",
        // Some MSG91 endpoints also read the authkey from a header — send it both ways to be safe.
        authkey,
      },
      body:
        encoding === "json"
          ? JSON.stringify({ authkey, "access-token": accessToken })
          : new URLSearchParams({ authkey, "access-token": accessToken }).toString(),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  // Read as text first so we can handle non-JSON error bodies too (never log the token itself).
  const rawText = await response.text();
  let body: unknown;
  try {
    body = rawText ? JSON.parse(rawText) : {};
  } catch {
    body = rawText;
  }

  const root = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const type = typeof root.type === "string" ? root.type.toLowerCase() : "";
  const message =
    typeof root.message === "string" ? root.message : typeof body === "string" ? body : null;

  return {
    success: response.ok && type !== "error" && type !== "failure",
    status: response.status,
    body,
    message,
  };
}

/**
 * Verify a MSG91 widget access token and return the verified phone in E.164, or throw an ApiError.
 * Tries JSON first (what the v5 widget endpoint expects) and falls back to form-encoding so we're
 * resilient to either content-type MSG91 may require.
 */
export async function verifyMsg91AccessToken(accessToken: string): Promise<string> {
  if (!features.msg91 || !env.MSG91_AUTH_KEY) {
    throw ApiError.internal("Phone verification is not configured");
  }

  let result: Msg91Result;
  try {
    result = await callVerify(accessToken, "json");
    // If JSON didn't parse the field (older endpoints), retry once as form-encoded.
    if (!result.success && /access-token.*required/i.test(result.message ?? "")) {
      result = await callVerify(accessToken, "form");
    }
  } catch (err) {
    logger.warn("MSG91 verify request failed", { err: err instanceof Error ? err.message : String(err) });
    throw ApiError.internal("Couldn't reach the verification service — please try again");
  }

  if (!result.success) {
    logger.warn("MSG91 token verification rejected", {
      status: result.status,
      reason: result.message ?? "unknown",
    });
    throw new ApiError(
      400,
      "OTP_VERIFICATION_FAILED",
      result.message?.trim() || "Phone verification failed — please try again",
    );
  }

  const phone = extractPhone(result.body, accessToken);
  if (!phone) {
    logger.warn("MSG91 verify response had no usable phone number", { body: result.body });
    throw new ApiError(400, "OTP_VERIFICATION_FAILED", "Could not read the verified phone number");
  }

  return phone;
}
