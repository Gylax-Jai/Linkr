import type { ChatParticipant } from "@linkr/shared";
import { formatLastSeen } from "./formatTime";

/** Whether the viewer may see online / last-seen for this participant (Phase 4.2). */
export function canShowPresence(participant: ChatParticipant): boolean {
  return participant.presenceVisible !== false;
}

/** Whether the viewer may see display name, bio and custom status (Phase 4.3). */
export function canShowProfileDetails(participant: ChatParticipant): boolean {
  return participant.profileDetailsVisible !== false;
}

/** Display name follows profile-details privacy (not avatar). */
export function canShowDisplayName(participant: ChatParticipant): boolean {
  return canShowProfileDetails(participant);
}

/** Avatar thumbnail visible (Friends/Everyone profile privacy). */
export function canShowContactCard(participant: ChatParticipant): boolean {
  return participant.contactCardVisible !== false;
}

/** Full-screen avatar zoom — friends-only when profile privacy is Friends. */
export function canZoomAvatar(participant: ChatParticipant): boolean {
  return participant.avatarZoomable === true && canShowContactCard(participant);
}

/**
 * Resolve presence label for a chat header / details pane. Returns `null` when privacy hides it.
 * Socket overrides still apply — pass the effective `online` flag after merging overrides.
 */
export function getPresenceLabel(
  participant: ChatParticipant,
  online: boolean,
): string | null {
  if (!canShowPresence(participant)) return null;
  if (online) return "Online";
  return formatLastSeen(participant.lastSeen) ?? "Offline";
}

/** Whether to show the green online dot on an avatar. */
export function showOnlineDot(participant: ChatParticipant, online: boolean): boolean {
  return canShowPresence(participant) && online;
}
