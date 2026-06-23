import { Mic, MicOff, Phone, PhoneOff, Volume2, VolumeX } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useCallStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useCallActions } from "./CallProvider";
import { CallTimer, useCallStatusText } from "./CallOverlay";

/**
 * Slim, always-on-top call bar shown while a call is minimized — the call keeps running in the
 * background so the user can browse chats. Tap the bar to expand back to the full-screen surface.
 */
export function CallBar() {
  const phase = useCallStore((s) => s.phase);
  const uiMode = useCallStore((s) => s.uiMode);
  const peer = useCallStore((s) => s.peer);
  const muted = useCallStore((s) => s.muted);
  const speakerOn = useCallStore((s) => s.speakerOn);
  const connectedAt = useCallStore((s) => s.connectedAt);
  const connection = useCallStore((s) => s.connection);
  const { hangUp, toggleMute, toggleSpeaker, expand } = useCallActions();
  const statusText = useCallStatusText();

  if (phase === "idle" || phase === "incoming" || !peer) return null;
  if (uiMode !== "minimized") return null;

  const name = peer.displayName || peer.username || "Unknown";
  const dotClass =
    connection === "connected"
      ? "bg-online"
      : connection === "failed" || connection === "disconnected"
        ? "bg-red-500"
        : "bg-amber-400";

  return (
    <div className="fixed inset-x-0 top-2 z-[115] flex justify-center px-2 animate-fade-in-up">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-border bg-surface/95 px-3 py-2 shadow-elevated backdrop-blur-sm">
        <button
          type="button"
          onClick={expand}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-0.5 text-left transition-colors hover:bg-surface-2"
          aria-label="Expand call"
        >
          <span className="relative shrink-0">
            <Avatar name={name} src={peer.avatar} size="sm" />
            <span
              className={cn(
                "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface",
                phase === "active" ? dotClass : "bg-primary animate-pulse",
              )}
              aria-hidden="true"
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-text">{name}</span>
            <span className="block truncate text-xs text-text-muted">
              {phase === "active" && connectedAt ? <CallTimer connectedAt={connectedAt} /> : statusText}
            </span>
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          {phase !== "ended" ? (
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
              aria-pressed={muted}
              className={cn(
                "grid h-9 w-9 place-items-center rounded-full transition-colors",
                muted ? "bg-text text-surface" : "bg-surface-2 text-text hover:opacity-80",
              )}
            >
              {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          ) : null}
          {phase !== "ended" ? (
            <button
              type="button"
              onClick={toggleSpeaker}
              aria-label={speakerOn ? "Speaker off" : "Speaker on"}
              aria-pressed={speakerOn}
              className={cn(
                "grid h-9 w-9 place-items-center rounded-full transition-colors",
                speakerOn ? "bg-primary text-primary-foreground" : "bg-surface-2 text-text hover:opacity-80",
              )}
            >
              {speakerOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          ) : null}
          <button
            type="button"
            onClick={hangUp}
            aria-label="End call"
            className="grid h-9 w-9 place-items-center rounded-full bg-red-500 text-white transition-transform hover:scale-105 active:scale-95"
          >
            {phase === "ended" ? <Phone className="h-4 w-4" /> : <PhoneOff className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
