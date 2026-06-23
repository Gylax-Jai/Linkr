import { Bluetooth, Headphones, Mic, MicOff, Phone, PhoneOff, Speaker, Volume2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { routeLabel, type AudioRouteKind } from "./audioRoute";
import { useCallActions } from "./CallProvider";
import { CallTimer, useCallStatusText } from "./CallOverlay";

const ROUTE_ICON: Record<AudioRouteKind, LucideIcon> = {
  bluetooth: Bluetooth,
  headset: Headphones,
  speaker: Speaker,
  earpiece: Phone,
  default: Volume2,
};

/**
 * WhatsApp-style call bar (Sprint 3.1.2): a thin, full-width strip glued to the very top of the app
 * while a call is minimized. It pushes the app content down (see AppShell) rather than floating over
 * the header. Tap the bar to expand back to the full-screen call surface.
 */
export function CallBar() {
  const phase = useCallStore((s) => s.phase);
  const uiMode = useCallStore((s) => s.uiMode);
  const peer = useCallStore((s) => s.peer);
  const muted = useCallStore((s) => s.muted);
  const audioRoute = useCallStore((s) => s.audioRoute);
  const availableRoutes = useCallStore((s) => s.availableRoutes);
  const connectedAt = useCallStore((s) => s.connectedAt);
  const { hangUp, toggleMute, cycleAudioRoute, expand } = useCallActions();
  const statusText = useCallStatusText();

  if (phase === "idle" || phase === "incoming" || !peer) return null;
  if (uiMode !== "minimized") return null;

  const name = peer.displayName || peer.username || "Unknown";
  const RouteIcon = ROUTE_ICON[audioRoute];
  const canSwitchRoute = availableRoutes.length > 1;
  const live = phase !== "ended";

  return (
    <div className="fixed inset-x-0 top-0 z-[120] h-11 bg-primary text-primary-foreground shadow-soft">
      <div className="mx-auto flex h-full max-w-screen-2xl items-center gap-2 px-3">
        {/* Tap target: name + status, expands the call. */}
        <button
          type="button"
          onClick={expand}
          className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
          aria-label="Return to call"
        >
          <Phone className="h-4 w-4 shrink-0 animate-pulse" aria-hidden="true" />
          <span className="min-w-0 truncate text-sm font-medium">
            {phase === "active" && connectedAt ? (
              <>
                {name} · <CallTimer connectedAt={connectedAt} />
              </>
            ) : (
              <>
                {statusText} · {name}
              </>
            )}
          </span>
        </button>

        {/* Compact controls. Stop click bubbling so they don't expand the call. */}
        {live ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleMute();
              }}
              aria-label={muted ? "Unmute" : "Mute"}
              aria-pressed={muted}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-full transition-colors",
                muted ? "bg-primary-foreground text-primary" : "hover:bg-black/10",
              )}
            >
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                cycleAudioRoute();
              }}
              disabled={!canSwitchRoute}
              aria-label={`Audio output: ${routeLabel(audioRoute)}`}
              title={routeLabel(audioRoute)}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-black/10",
                !canSwitchRoute && "opacity-50",
              )}
            >
              <RouteIcon className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            hangUp();
          }}
          aria-label="End call"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-red-500 text-white transition-transform hover:scale-105 active:scale-95"
        >
          {phase === "ended" ? <Phone className="h-4 w-4" /> : <PhoneOff className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
