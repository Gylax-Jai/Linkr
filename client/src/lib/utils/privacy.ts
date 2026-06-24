import type { ChatParticipant } from "@linkr/shared";
import { formatLastSeen } from "./formatTime";

/** Whether the viewer may see online / last-seen for this participant (Phase 4.2). */
export function canShowPresence(participant: ChatParticipant): boolean {
  return participant.presenceVisible !== false;
}

/** Whether the viewer may see bio / custom status (Phase 4.2). */
export function canShowProfileDetails(participant: ChatParticipant): boolean {
  return participant.profileDetailsVisible !== false;
}

/** Avatar + contact card — same visibility as profile details. */
export function canShowContactCard(participant: ChatParticipant): boolean {
  return participant.contactCardVisible !== false;
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
