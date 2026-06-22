import type { ID, PrivacySettings, Timestamp } from "./common.js";

/** A Linkr user account (blueprint §12). Phone is stored encrypted server-side and never shipped to clients. */
export interface User {
  _id: ID;
  googleId: string;
  email: string;
  /** Optional until onboarding assigns a unique @username (blueprint §4). */
  username?: string;
  displayName: string;
  avatar?: string;
  bio?: string;
  status?: string;
  /** True once the user has finished onboarding (username + verified phone + profile). */
  onboarded: boolean;
  lastSeen?: Timestamp;
  online: boolean;
  privacy: PrivacySettings;
  createdAt: Timestamp;
}

/**
 * The privacy-limited view of another user that a stranger/pending user may receive
 * (blueprint §5): name, @username and picture only.
 */
export type PublicUser = Pick<User, "_id" | "username" | "displayName" | "avatar">;
