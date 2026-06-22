import { useAuthedObjectUrl } from "@/lib/hooks/useAuthedObjectUrl";
import { cn } from "@/lib/utils";

type AvatarSize = "sm" | "md" | "lg" | "xl";

const SIZE_STYLES: Record<AvatarSize, string> = {
  sm: "h-9 w-9 text-xs",
  md: "h-11 w-11 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-20 w-20 text-2xl",
};

const DOT_STYLES: Record<AvatarSize, string> = {
  sm: "h-2.5 w-2.5",
  md: "h-3 w-3",
  lg: "h-3.5 w-3.5",
  xl: "h-5 w-5",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}

interface AvatarProps {
  name: string;
  src?: string;
  size?: AvatarSize;
  ring?: boolean;
  online?: boolean;
  /** Animated pulse ring when user is online (details pane). */
  pulseRing?: boolean;
  className?: string;
}

/** Gradient initial-based avatar with optional presence dot and pulse ring. */
export function Avatar({
  name,
  src,
  size = "md",
  ring = false,
  online = false,
  pulseRing = false,
  className,
}: AvatarProps) {
  // Local avatars are served from an authenticated route; fetch them as a blob. Public URLs
  // (Cloudinary / Google) pass straight through.
  const { src: resolvedSrc } = useAuthedObjectUrl(src);
  const showImage = Boolean(resolvedSrc);

  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      {pulseRing && online ? (
        <span className="avatar-pulse-ring absolute inset-0 rounded-full" aria-hidden="true" />
      ) : null}
      {showImage ? (
        <img
          src={resolvedSrc}
          alt=""
          className={cn(
            "relative rounded-full object-cover shadow-soft",
            SIZE_STYLES[size],
            ring && "ring-2 ring-primary/30 ring-offset-2 ring-offset-surface",
          )}
          onError={(e) => {
            e.currentTarget.style.display = "none";
            e.currentTarget.nextElementSibling?.classList.remove("hidden");
          }}
        />
      ) : null}
      <span
        className={cn(
          "relative grid place-items-center rounded-full bg-gradient-primary font-mono font-semibold text-primary-foreground shadow-soft",
          SIZE_STYLES[size],
          ring && "ring-2 ring-primary/30 ring-offset-2 ring-offset-surface",
          showImage && "hidden",
        )}
      >
        {getInitials(name)}
      </span>
      {online ? (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full bg-online ring-2 ring-surface",
            DOT_STYLES[size],
          )}
          aria-hidden="true"
        />
      ) : null}
    </span>
  );
}
