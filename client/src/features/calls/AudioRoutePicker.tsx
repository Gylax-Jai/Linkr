import { useEffect, useRef, useState } from "react";
import { Bluetooth, Check, ChevronDown, Headphones, Phone, Speaker, Volume2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { routeLabel, type AudioRouteKind } from "./audioRoute";
import { useCallActions } from "./CallProvider";

const ROUTE_ICON: Record<AudioRouteKind, LucideIcon> = {
  bluetooth: Bluetooth,
  headset: Headphones,
  speaker: Speaker,
  earpiece: Phone,
  default: Volume2,
};

/**
 * Audio-output route control (Sprint 3.1.3). The button shows the *current* route's icon (so it
 * reflects reality — e.g. Bluetooth when earbuds are connected); tapping opens a small dropdown to
 * switch between the available outputs (Bluetooth / Headset / Speaker / Earpiece). When only one
 * route exists (or the browser can't switch sinks, e.g. iOS), it renders as a static indicator.
 */
export function AudioRoutePicker({ variant = "overlay" }: { variant?: "overlay" | "bar" }) {
  const audioRoute = useCallStore((s) => s.audioRoute);
  const audioDeviceId = useCallStore((s) => s.audioDeviceId);
  const routes = useCallStore((s) => s.availableRoutes);
  const { selectAudioRoute } = useCallActions();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close the menu on outside-click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const Icon = ROUTE_ICON[audioRoute];
  const canSwitch = routes.length > 1;
  const big = variant === "overlay";

  const triggerSize = big ? "h-14 w-14" : "h-8 w-8";
  const iconSize = big ? "h-6 w-6" : "h-4 w-4";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (canSwitch) setOpen((v) => !v);
        }}
        disabled={!canSwitch}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Audio output: ${routeLabel(audioRoute)}`}
        title={routeLabel(audioRoute)}
        className={cn(
          "relative grid place-items-center rounded-full transition-transform active:scale-95",
          triggerSize,
          big
            ? "bg-surface-2 text-text shadow-soft hover:scale-105"
            : "text-primary-foreground hover:bg-black/10",
          !canSwitch && "opacity-60",
        )}
      >
        <Icon className={iconSize} />
        {canSwitch ? (
          <ChevronDown
            className={cn(
              "absolute rounded-full bg-text text-surface",
              big ? "-bottom-0.5 -right-0.5 h-4 w-4 p-0.5" : "-bottom-1 -right-1 h-3 w-3 p-px",
            )}
          />
        ) : null}
        {big ? (
          <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-text-muted">
            {routeLabel(audioRoute)}
          </span>
        ) : null}
      </button>

      {open && canSwitch ? (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "absolute z-[130] min-w-[160px] overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-elevated",
            big ? "bottom-full left-1/2 mb-3 -translate-x-1/2" : "right-0 top-full mt-2",
          )}
        >
          {routes.map((r) => {
            const RIcon = ROUTE_ICON[r.kind];
            const active = r.deviceId === audioDeviceId || (!audioDeviceId && r.kind === audioRoute);
            return (
              <button
                key={r.deviceId || r.kind}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  selectAudioRoute(r.deviceId);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-2",
                  active ? "text-text" : "text-text-muted",
                )}
              >
                <RIcon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{routeLabel(r.kind)}</span>
                {active ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
