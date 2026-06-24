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

/** Bio, status, avatar — everyone / friends-only / hidden. */
export function canViewProfileDetails(privacy: PrivacyDoc, viewerIsFriend: boolean): boolean {
  const setting = normalizeProfileVisibility(privacy?.profile);
  if (setting === "nobody") return false;
  if (setting === "friends") return viewerIsFriend;
  return true;
}

/** Contact card uses the same rules as profile details (avatar, name in chat context). */
export function canViewContactCard(privacy: PrivacyDoc, viewerIsFriend: boolean): boolean {
  return canViewProfileDetails(privacy, viewerIsFriend);
}

/** Whether this user allows broadcasting online/offline to friends at all. */
export function allowsPresenceBroadcast(privacy: PrivacyDoc): boolean {
  return (privacy?.lastSeen ?? "friends") !== "nobody";
}
