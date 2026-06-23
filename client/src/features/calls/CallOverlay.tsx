import { useEffect, useState } from "react";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useCallStore } from "@/lib/store";
import type { CallEndReason } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useCallActions } from "./CallProvider";

const END_LABELS: Record<CallEndReason, string> = {
  hangup: "Call ended",
  rejected: "Call declined",
  unavailable: "Unavailable",
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
function CallTimer({ connectedAt }: { connectedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <span className="font-mono tabular-nums">{formatDuration(now - connectedAt)}</span>;
}

/** In-call surface for the caller/active call: status, duration, mute + hang-up controls. */
export function CallOverlay() {
  const phase = useCallStore((s) => s.phase);
  const peer = useCallStore((s) => s.peer);
  const muted = useCallStore((s) => s.muted);
  const connectedAt = useCallStore((s) => s.connectedAt);
  const connection = useCallStore((s) => s.connection);
  const endReason = useCallStore((s) => s.endReason);
  const { hangUp, toggleMute } = useCallActions();

  // The incoming modal owns the "incoming" phase; this overlay covers everything else.
  if (phase === "idle" || phase === "incoming" || !peer) return null;

  const name = peer.displayName || peer.username || "Unknown";

  const statusText =
    phase === "outgoing"
      ? "Ringing…"
      : phase === "connecting"
        ? "Connecting…"
        : phase === "active" && connectedAt
          ? null // timer renders instead
          : phase === "ended" && endReason
            ? END_LABELS[endReason]
            : "…";

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
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-3xl bg-surface p-8 text-center shadow-elevated">
        <div className="relative">
          {phase === "outgoing" || phase === "connecting" ? (
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

        <div className="flex items-center gap-6">
          {phase === "active" || phase === "connecting" ? (
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
