import type { ID, PrivacySettings, Timestamp } from "./common.js";

/**
 * The authenticated user as seen by the client — the full account view for "me", minus any
 * sensitive fields. Phone is NEVER included (blueprint §4: stored encrypted, never shipped).
 */
export interface SessionUser {
  _id: ID;
  email: string;
  username?: string;
  displayName: string;
  avatar?: string;
  bio?: string;
  status?: string;
  /** When the custom status auto-clears (ISO). Absent = no expiry (Sprint C.1). */
  statusExpiresAt?: Timestamp;
  onboarded: boolean;
  phoneVerified: boolean;
  privacy: PrivacySettings;
  createdAt: Timestamp;
}

/** Successful auth/refresh response: the session user plus a short-lived access token. */
export interface AuthResponse {
  user: SessionUser;
  accessToken: string;
}

/**
 * Response for the OTP send endpoint. `devCode` is only ever populated outside production
 * (no SMS provider configured) so the flow is testable locally — never in production.
 */
export interface OtpSendResponse {
  sent: boolean;
  expiresInMs: number;
  devCode?: string;
}

/** Response for the username-availability check. */
export interface UsernameAvailability {
  available: boolean;
}

/**
 * A logged-in device/session (Sprint E). Backed by a server-side `Session` record so the user can
 * see where they're signed in and remotely revoke a device. No tokens or secrets are ever included.
 */
export interface DeviceSession {
  _id: ID;
  /** Friendly label derived from the user agent, e.g. "Chrome on Windows". */
  label: string;
  /** True for the session making this request (the current device). */
  current: boolean;
  /** Last time this session refreshed its token (ISO). */
  lastSeenAt: Timestamp;
  /** When the session was created / first signed in (ISO). */
  createdAt: Timestamp;
}

/** GET /api/sessions — every active session for the current account. */
export interface SessionListResponse {
  sessions: DeviceSession[];
}
