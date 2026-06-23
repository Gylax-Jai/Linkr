/** Format an ISO timestamp for message bubbles (e.g. "9:41 AM"). */
export function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Relative label for chat list rows. */
export function formatChatListTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Presence subtitle for the chat header when a contact is offline (Sprint C.2), e.g.
 * "last seen just now" / "last seen 12m ago" / "last seen yesterday" / "last seen on Mar 3".
 * Returns null when there's no timestamp (so the caller can fall back to a plain "Offline").
 */
export function formatLastSeen(iso?: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "last seen just now";
  if (diffMin < 60) return `last seen ${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24 && date.toDateString() === now.toDateString()) {
    return `last seen ${diffHr}h ago`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    const t = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return `last seen yesterday at ${t}`;
  }

  return `last seen on ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

/** Human-friendly day separator label. */
export function formatDayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
