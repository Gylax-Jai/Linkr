import { Lock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Privacy trust badge. The copy is intentionally accurate so we never claim a security property the
 * app does not provide:
 *  - `e2ee` (Phase 2): the peer has a published key and this chat's text is END-TO-END encrypted
 *    (sealed client-side; the server stores ciphertext only).
 *  - default: encrypted in transit only (HTTPS/WSS) — used for the dev bot and peers without a key.
 */
const E2EE_TOOLTIP = "End-to-end encrypted · only you and your contact can read these messages";
const TRANSIT_TOOLTIP = "Encrypted in transit · end-to-end encryption applies once your contact has a key";

/**
 * Custom hover/focus tooltip anchored to the badge. Replaces the native `title=` (whose huge white
 * OS bubble bled across the header on hover). Constrained width + right-aligned so it never spills
 * off-screen; pointer-events-none so it can't trap hover.
 */
function BadgeTooltip({ text }: { text: string }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 hidden w-60 max-w-[min(16rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface px-3 py-2 text-[11px] font-normal leading-snug text-text shadow-elevated group-hover:block group-focus-visible:block"
    >
      {text}
    </span>
  );
}

export function EncryptedBadge({
  className,
  iconOnly = false,
  e2ee = false,
}: {
  className?: string;
  iconOnly?: boolean;
  /** True when the active chat is end-to-end encrypted (peer has a published key). */
  e2ee?: boolean;
}) {
  const tooltip = e2ee ? E2EE_TOOLTIP : TRANSIT_TOOLTIP;
  const Icon = e2ee ? ShieldCheck : Lock;

  if (iconOnly) {
    return (
      <span
        tabIndex={0}
        aria-label={tooltip}
        className={cn(
          "group relative grid h-8 w-8 place-items-center rounded-full border outline-none",
          e2ee
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "border-primary/20 bg-primary/10 text-primary",
          className,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        <BadgeTooltip text={tooltip} />
      </span>
    );
  }

  return (
    <span
      tabIndex={0}
      aria-label={tooltip}
      className={cn(
        "group relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide text-text outline-none",
        e2ee ? "border-emerald-500/30 bg-emerald-500/10" : "border-primary/20 bg-primary/10",
        className,
      )}
    >
      <Icon className={cn("h-3 w-3", e2ee ? "text-emerald-600 dark:text-emerald-400" : "text-primary")} />
      {e2ee ? "End-to-end encrypted" : "Private chat"}
      <BadgeTooltip text={tooltip} />
    </span>
  );
}
