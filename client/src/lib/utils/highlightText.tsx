import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Wrap case-insensitive query matches in <mark>; the active occurrence gets a stronger highlight. */
export function highlightText(text: string, query: string, active: boolean): ReactNode {
  const q = query.trim();
  if (!q) return text;

  const lowerText = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  const parts: ReactNode[] = [];
  let start = 0;
  let idx = lowerText.indexOf(lowerQ, start);
  let partKey = 0;

  while (idx !== -1) {
    if (idx > start) parts.push(text.slice(start, idx));
    parts.push(
      <mark
        key={partKey++}
        className={cn(
          "rounded-sm px-0.5",
          active ? "bg-primary text-primary-foreground" : "bg-primary/35 text-inherit",
        )}
      >
        {text.slice(idx, idx + q.length)}
      </mark>,
    );
    start = idx + q.length;
    idx = lowerText.indexOf(lowerQ, start);
  }

  if (start < text.length) parts.push(text.slice(start));
  return parts.length ? parts : text;
}
