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
        title={tooltip}
        aria-label={tooltip}
        className={cn(
          "grid h-8 w-8 place-items-center rounded-full border",
          e2ee
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : "border-primary/20 bg-primary/10 text-primary",
          className,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
    );
  }

  return (
    <span
      title={tooltip}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tracking-wide text-text",
        e2ee ? "border-emerald-500/30 bg-emerald-500/10" : "border-primary/20 bg-primary/10",
        className,
      )}
    >
      <Icon className={cn("h-3 w-3", e2ee ? "text-emerald-600 dark:text-emerald-400" : "text-primary")} />
      {e2ee ? "End-to-end encrypted" : "Private chat"}
    </span>
  );
}
