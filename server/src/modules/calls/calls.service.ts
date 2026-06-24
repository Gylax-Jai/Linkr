import crypto from "node:crypto";
import type { IceConfigResponse, IceServerConfig } from "@linkr/shared";
import { env, features } from "../../config/env.js";

const DEFAULT_STUN = ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"];

function splitUrls(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((u) => u.trim())
    .filter((u) => u.length > 0);
}

/**
 * Managed TURN (Metered Open Relay, etc.): fixed username + credential from the provider dashboard.
 * The server forwards them to authenticated clients only — never commit these to source control.
 */
function buildStaticTurnServers(): IceServerConfig[] {
  const urls = splitUrls(env.TURN_URLS);
  if (urls.length === 0 || !env.TURN_USERNAME || !env.TURN_CREDENTIAL) return [];
  return [{ urls, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL }];
}

/**
 * Mint short-lived TURN credentials for a user using coturn's "use-auth-secret" (TURN REST API)
 * scheme: username = "<unixExpiry>:<userId>", credential = base64(HMAC-SHA1(secret, username)).
 *
 * Note: HMAC-SHA1 is REQUIRED by the TURN REST API / coturn here — it is the wire protocol for
 * deriving the long-term-credential password, not a security control over our own data. The shared
 * TURN_SECRET never leaves the server; only the derived, expiring credential is sent to the client.
 */
function buildCoturnTurnServers(userId: string, expiry: number): IceServerConfig[] {
  const urls = splitUrls(env.TURN_URLS);
  if (urls.length === 0 || !env.TURN_SECRET) return [];

  const username = `${expiry}:${userId}`;
  const credential = crypto
    .createHmac("sha1", env.TURN_SECRET)
    .update(username)
    .digest("base64");

  return [{ urls, username, credential }];
}

/**
 * Build the ICE server list a client uses to establish a WebRTC call. STUN is always present;
 * TURN entries are added when configured (static managed creds take precedence over coturn mint).
 */
export function buildIceConfig(userId: string): IceConfigResponse {
  const stunUrls = splitUrls(env.STUN_URLS);
  const ttl = env.TURN_TTL;
  const expiry = Math.floor(Date.now() / 1000) + ttl;

  const iceServers: IceServerConfig[] = [
    { urls: stunUrls.length > 0 ? stunUrls : DEFAULT_STUN },
  ];

  if (features.turnStatic) {
    iceServers.push(...buildStaticTurnServers());
  } else if (features.turnCoturn) {
    iceServers.push(...buildCoturnTurnServers(userId, expiry));
  }

  return { iceServers, ttl: expiry };
}
