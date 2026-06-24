/** A MongoDB ObjectId rendered as a string across the API/socket boundary. */
export type ID = string;

/** ISO-8601 timestamp string (or Date when used server-side before serialization). */
export type Timestamp = string;

/** Who is allowed to see a given piece of profile data. */
export type Visibility = "everyone" | "friends" | "nobody";

/** Who can see bio, custom status, avatar and contact card (Phase 4.2+). */
export type ProfileVisibility = "everyone" | "friends" | "nobody";

/** Who is allowed to send this user a friend request. */
export type WhoCanRequest = "everyone" | "nobody";

/** Per-user privacy controls (blueprint §12). */
export interface PrivacySettings {
  lastSeen: Visibility;
  /** Who can see display name, custom status and bio (Phase 4.3). */
  profileDetails: ProfileVisibility;
  /** Who can see profile photo; zoom is friends-only when picture is Everyone (Phase 4.3). */
  profilePicture: ProfileVisibility;
  whoCanRequest: WhoCanRequest;
}
