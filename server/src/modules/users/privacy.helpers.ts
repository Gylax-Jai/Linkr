import type { ProfileVisibility, Visibility } from "@linkr/shared";

type PrivacyDoc = {
  lastSeen?: string | null;
  profile?: string | null;
} | null | undefined;

/** Map legacy `everyone` profile visibility to `friends` (Phase 4.2). */
export function normalizeProfileVisibility(raw?: string | null): ProfileVisibility {
  if (raw === "nobody") return "nobody";
  return "friends";
}

export function canViewLastSeen(privacy: PrivacyDoc, viewerIsFriend: boolean): boolean {
  const setting = (privacy?.lastSeen ?? "friends") as Visibility;
  if (setting === "nobody") return false;
  if (setting === "friends") return viewerIsFriend;
  return true;
}

export function canViewProfileDetails(privacy: PrivacyDoc, viewerIsFriend: boolean): boolean {
  const setting = normalizeProfileVisibility(privacy?.profile);
  if (setting === "nobody") return false;
  return viewerIsFriend;
}

/**
 * Whether a non-friend may see the contact card (avatar, name, @username). Default profile privacy
 * ("friends") still allows strangers to discover basic contact info; only "nobody" hides it (Phase 4.2+).
 */
export function canViewContactCard(privacy: PrivacyDoc, viewerIsFriend: boolean): boolean {
  if (viewerIsFriend) return true;
  return normalizeProfileVisibility(privacy?.profile) !== "nobody";
}

/** Whether this user allows broadcasting online/offline to friends at all. */
export function allowsPresenceBroadcast(privacy: PrivacyDoc): boolean {
  return (privacy?.lastSeen ?? "friends") !== "nobody";
}
