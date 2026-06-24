import type { ProfileVisibility, Visibility } from "@linkr/shared";

type PrivacyDoc = {
  lastSeen?: string | null;
  profile?: string | null;
} | null | undefined;

export function normalizeProfileVisibility(raw?: string | null): ProfileVisibility {
  if (raw === "nobody") return "nobody";
  if (raw === "everyone") return "everyone";
  return "friends";
}

export function canViewLastSeen(privacy: PrivacyDoc, viewerIsFriend: boolean): boolean {
  const setting = (privacy?.lastSeen ?? "friends") as Visibility;
  if (setting === "nobody") return false;
  if (setting === "friends") return viewerIsFriend;
  return true;
}

/** Bio and custom status — friends-only when profile is Friends; hidden when Nobody. */
export function canViewProfileDetails(privacy: PrivacyDoc, viewerIsFriend: boolean): boolean {
  const setting = normalizeProfileVisibility(privacy?.profile);
  if (setting === "nobody") return false;
  if (setting === "friends") return viewerIsFriend;
  return true;
}

/** Avatar thumbnail — visible for Everyone and Friends; hidden when Nobody. */
export function canViewAvatarThumbnail(privacy: PrivacyDoc, _viewerIsFriend: boolean): boolean {
  return normalizeProfileVisibility(privacy?.profile) !== "nobody";
}

/** Full-screen avatar zoom — Everyone: all; Friends: friends only; Nobody: none. */
export function canZoomAvatar(privacy: PrivacyDoc, viewerIsFriend: boolean): boolean {
  const setting = normalizeProfileVisibility(privacy?.profile);
  if (setting === "nobody") return false;
  if (setting === "friends") return viewerIsFriend;
  return true;
}

/** @deprecated Use canViewAvatarThumbnail — kept for imports during migration. */
export function canViewContactCard(privacy: PrivacyDoc, viewerIsFriend: boolean): boolean {
  return canViewAvatarThumbnail(privacy, viewerIsFriend);
}

/** Whether this user allows broadcasting online/offline to friends at all. */
export function allowsPresenceBroadcast(privacy: PrivacyDoc): boolean {
  return (privacy?.lastSeen ?? "friends") !== "nobody";
}
