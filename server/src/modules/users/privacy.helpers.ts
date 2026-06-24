import type { ProfileVisibility, Visibility } from "@linkr/shared";

type PrivacyDoc = {
  lastSeen?: string | null;
  /** @deprecated Legacy combined setting — falls back when split fields are absent. */
  profile?: string | null;
  profileDetails?: string | null;
  profilePicture?: string | null;
} | null | undefined;

export function normalizeProfileVisibility(raw?: string | null): ProfileVisibility {
  if (raw === "nobody") return "nobody";
  if (raw === "everyone") return "everyone";
  return "friends";
}

function profileDetailsSetting(privacy: PrivacyDoc): ProfileVisibility {
  return normalizeProfileVisibility(privacy?.profileDetails ?? privacy?.profile);
}

function profilePictureSetting(privacy: PrivacyDoc): ProfileVisibility {
  return normalizeProfileVisibility(privacy?.profilePicture ?? privacy?.profile);
}

export function canViewLastSeen(privacy: PrivacyDoc, viewerIsFriend: boolean): boolean {
  const setting = (privacy?.lastSeen ?? "friends") as Visibility;
  if (setting === "nobody") return false;
  if (setting === "friends") return viewerIsFriend;
  return true;
}

/** Display name, bio and custom status (Phase 4.3 — independent from profile picture). */
export function canViewProfileDetails(privacy: PrivacyDoc, viewerIsFriend: boolean): boolean {
  const setting = profileDetailsSetting(privacy);
  if (setting === "nobody") return false;
  if (setting === "friends") return viewerIsFriend;
  return true;
}

/** Avatar thumbnail — controlled by profilePicture only. */
export function canViewAvatarThumbnail(privacy: PrivacyDoc, viewerIsFriend: boolean): boolean {
  const setting = profilePictureSetting(privacy);
  if (setting === "nobody") return false;
  if (setting === "friends") return viewerIsFriend;
  return true;
}

/**
 * Full-screen avatar zoom — Everyone: strangers see thumbnail only; friends can zoom.
 * Friends/Nobody picture settings follow profilePicture rules.
 */
export function canZoomAvatar(privacy: PrivacyDoc, viewerIsFriend: boolean): boolean {
  const setting = profilePictureSetting(privacy);
  if (setting === "nobody") return false;
  return viewerIsFriend;
}

/** @deprecated Use canViewAvatarThumbnail — kept for imports during migration. */
export function canViewContactCard(privacy: PrivacyDoc, viewerIsFriend: boolean): boolean {
  return canViewAvatarThumbnail(privacy, viewerIsFriend);
}

/** Whether this user allows broadcasting online/offline to friends at all. */
export function allowsPresenceBroadcast(privacy: PrivacyDoc): boolean {
  return (privacy?.lastSeen ?? "friends") !== "nobody";
}

/** Map stored privacy doc to client-facing split settings (migrates legacy `profile`). */
export function toClientPrivacy(privacy: PrivacyDoc): {
  lastSeen: Visibility;
  profileDetails: ProfileVisibility;
  profilePicture: ProfileVisibility;
  whoCanRequest: "everyone" | "nobody";
} {
  const fallback = normalizeProfileVisibility(privacy?.profile);
  return {
    lastSeen: (privacy?.lastSeen ?? "friends") as Visibility,
    profileDetails: normalizeProfileVisibility(privacy?.profileDetails ?? privacy?.profile ?? fallback),
    profilePicture: normalizeProfileVisibility(privacy?.profilePicture ?? privacy?.profile ?? fallback),
    whoCanRequest: (privacy?.whoCanRequest ?? "everyone") as "everyone" | "nobody",
  };
}
