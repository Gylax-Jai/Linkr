import { useEffect, useState } from "react";
import { Bluetooth, ChevronDown, Headphones, Mic, MicOff, Phone, PhoneOff, Speaker, Volume2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useCallStore } from "@/lib/store";
import type { CallEndReason } from "@/lib/store";
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

const END_LABELS: Record<CallEndReason, string> = {
  hangup: "Call ended",
  rejected: "Call declined",
  unavailable: "No answer",
  busy: "Busy",
  failed: "Connection failed",
  "no-mic": "Microphone unavailable",
  cancelled: "Call cancelled",
};

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Live mm:ss timer for a connected call. */
export function CallTimer({ connectedAt }: { connectedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <span className="font-mono tabular-nums">{formatDuration(now - connectedAt)}</span>;
}

/**
 * Shared status text for a call surface (overlay + bar). Returns null while active so a live timer
 * can render instead.
 */
export function useCallStatusText(): string | null {
  const phase = useCallStore((s) => s.phase);
  const ringing = useCallStore((s) => s.ringing);
  const connectedAt = useCallStore((s) => s.connectedAt);
  const endReason = useCallStore((s) => s.endReason);

  if (phase === "outgoing") return ringing ? "Ringing…" : "Calling…";
  if (phase === "connecting") return "Connecting…";
  if (phase === "active" && connectedAt) return null;
  if (phase === "ended" && endReason) return END_LABELS[endReason];
  return "…";
}

/** Full-screen in-call surface: status, duration, mute, speaker, minimize, hang-up. */
export function CallOverlay() {
  const phase = useCallStore((s) => s.phase);
  const uiMode = useCallStore((s) => s.uiMode);
  const peer = useCallStore((s) => s.peer);
  const muted = useCallStore((s) => s.muted);
  const audioRoute = useCallStore((s) => s.audioRoute);
  const availableRoutes = useCallStore((s) => s.availableRoutes);
  const connectedAt = useCallStore((s) => s.connectedAt);
  const connection = useCallStore((s) => s.connection);
  const { hangUp, toggleMute, cycleAudioRoute, minimize } = useCallActions();
  const statusText = useCallStatusText();

  // The incoming modal owns "incoming"; this overlay covers the rest — but only when expanded.
  if (phase === "idle" || phase === "incoming" || !peer) return null;
  if (uiMode !== "expanded") return null;

  const name = peer.displayName || peer.username || "Unknown";
  const ringingPhase = phase === "outgoing" || phase === "connecting";
  const RouteIcon = ROUTE_ICON[audioRoute];
  const canSwitchRoute = availableRoutes.length > 1;

  const dotClass =
    connection === "connected"
      ? "bg-online"
      : connection === "failed" || connection === "disconnected"
        ? "bg-red-500"
        : "bg-amber-400";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Call with ${name}`}
      className="fixed inset-0 z-[110] grid place-items-center bg-black/85 p-4 backdrop-blur-sm animate-fade-in-up"
    >
      <button
        type="button"
        onClick={minimize}
        aria-label="Minimize call"
        title="Minimize"
        className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <ChevronDown className="h-5 w-5" />
      </button>

      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-3xl bg-surface p-8 text-center shadow-elevated">
        <div className="relative">
          {ringingPhase ? (
            <span className="avatar-pulse-ring absolute inset-0 rounded-full" aria-hidden="true" />
          ) : null}
          <Avatar name={name} src={peer.avatar} size="xl" />
        </div>

        <div className="space-y-1">
          <p className="text-lg font-semibold text-text">{name}</p>
          <p className="flex items-center justify-center gap-2 text-sm text-text-muted">
            {phase === "active" ? (
              <span className={cn("h-2 w-2 rounded-full", dotClass)} aria-hidden="true" />
            ) : null}
            {phase === "active" && connectedAt ? <CallTimer connectedAt={connectedAt} /> : statusText}
          </p>
        </div>

        <div className="flex items-center gap-5">
          {phase !== "ended" ? (
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
              aria-pressed={muted}
              className={cn(
                "grid h-14 w-14 place-items-center rounded-full shadow-soft transition-transform hover:scale-105 active:scale-95",
                muted ? "bg-text text-surface" : "bg-surface-2 text-text",
              )}
            >
              {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </button>
          ) : null}

          {phase !== "ended" ? (
            <button
              type="button"
              onClick={cycleAudioRoute}
              disabled={!canSwitchRoute}
              aria-label={`Audio output: ${routeLabel(audioRoute)}`}
              title={routeLabel(audioRoute)}
              className={cn(
                "relative grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-text shadow-soft transition-transform hover:scale-105 active:scale-95",
                !canSwitchRoute && "opacity-50",
              )}
            >
              <RouteIcon className="h-6 w-6" />
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-text-muted">
                {routeLabel(audioRoute)}
              </span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={hangUp}
            aria-label="End call"
            className="grid h-16 w-16 place-items-center rounded-full bg-red-500 text-white shadow-elevated transition-transform hover:scale-105 active:scale-95"
          >
            <PhoneOff className="h-7 w-7" />
          </button>
        </div>
      </div>
    </div>
  );
}
