import { useEffect, useRef, useState } from "react";
import { ChevronDown, Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useCallStore } from "@/lib/store";
import type { CallEndReason } from "@/lib/store";
import { cn } from "@/lib/utils";
import { AudioRoutePicker } from "./AudioRoutePicker";
import { useCallActions } from "./CallProvider";

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

/** Renders a MediaStream into a `<video>`, re-attaching when the stream reference changes. */
function VideoStream({
  stream,
  muted,
  mirrored,
  className,
}: {
  stream: MediaStream | null;
  muted: boolean;
  mirrored?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) void el.play().catch(() => {});
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={cn("h-full w-full object-cover", mirrored && "-scale-x-100", className)}
    />
  );
}

/** Mute + audio-route + hang-up controls shared by both call surfaces. */
function CallControls() {
  const phase = useCallStore((s) => s.phase);
  const muted = useCallStore((s) => s.muted);
  const media = useCallStore((s) => s.media);
  const cameraOff = useCallStore((s) => s.cameraOff);
  const { hangUp, toggleMute, toggleCamera } = useCallActions();
  const live = phase !== "ended";

  return (
    <div className="flex items-center gap-5" onClick={(e) => e.stopPropagation()}>
      {live ? (
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

      {live && media === "video" ? (
        <button
          type="button"
          onClick={toggleCamera}
          aria-label={cameraOff ? "Turn camera on" : "Turn camera off"}
          aria-pressed={cameraOff}
          className={cn(
            "grid h-14 w-14 place-items-center rounded-full shadow-soft transition-transform hover:scale-105 active:scale-95",
            cameraOff ? "bg-text text-surface" : "bg-surface-2 text-text",
          )}
        >
          {cameraOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
        </button>
      ) : null}

      {live ? <AudioRoutePicker variant="overlay" /> : null}

      <button
        type="button"
        onClick={hangUp}
        aria-label="End call"
        className="grid h-16 w-16 place-items-center rounded-full bg-red-500 text-white shadow-elevated transition-transform hover:scale-105 active:scale-95"
      >
        <PhoneOff className="h-7 w-7" />
      </button>
    </div>
  );
}

/** Full-screen video call surface: remote fills the screen, local in a corner PiP (Sprint 3.2). */
function VideoCallSurface({ name, avatar }: { name: string; avatar?: string }) {
  const phase = useCallStore((s) => s.phase);
  const connectedAt = useCallStore((s) => s.connectedAt);
  const cameraOff = useCallStore((s) => s.cameraOff);
  const localStream = useCallStore((s) => s.localStream);
  const remoteStream = useCallStore((s) => s.remoteStream);
  const { minimize } = useCallActions();
  const statusText = useCallStatusText();

  const remoteLive = phase === "active" && !!remoteStream;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Video call with ${name}`}
      onClick={minimize}
      className="fixed inset-0 z-[110] bg-black animate-fade-in-up"
    >
      {/* Remote video fills the screen once connected; otherwise a calm gradient backdrop. */}
      {remoteLive ? (
        <VideoStream stream={remoteStream} muted className="absolute inset-0" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-surface-2 to-black" />
      )}

      {/* Pre-connect: peer avatar + status centered over the backdrop. */}
      {!remoteLive ? (
        <div className="absolute inset-0 grid place-items-center px-4 text-center">
          <div className="flex flex-col items-center gap-5">
            <div className="relative">
              <span className="avatar-pulse-ring absolute inset-0 rounded-full" aria-hidden="true" />
              <Avatar name={name} src={avatar} size="xl" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-semibold text-white">{name}</p>
              <p className="text-sm text-white/70">{statusText}</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Top bar: status/timer + minimize. */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-white drop-shadow">
          {phase === "active" && connectedAt ? (
            <>
              {name} · <CallTimer connectedAt={connectedAt} />
            </>
          ) : (
            statusText
          )}
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            minimize();
          }}
          aria-label="Minimize call"
          title="Minimize"
          className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      </div>

      {/* Local preview PiP (mirrored). Shows an avatar placeholder while the camera is off. */}
      <div className="absolute right-4 top-20 h-40 w-28 overflow-hidden rounded-2xl border border-white/15 bg-surface-2 shadow-elevated sm:h-48 sm:w-36">
        {localStream && !cameraOff ? (
          <VideoStream stream={localStream} muted mirrored />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-b from-surface-2 to-surface">
            <VideoOff className="h-6 w-6 text-text-muted" aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Bottom controls. */}
      <div className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/70 to-transparent p-6 pb-10">
        <CallControls />
      </div>
    </div>
  );
}

/** Full-screen in-call surface: status, duration, mute, speaker, minimize, hang-up. */
export function CallOverlay() {
  const phase = useCallStore((s) => s.phase);
  const uiMode = useCallStore((s) => s.uiMode);
  const peer = useCallStore((s) => s.peer);
  const media = useCallStore((s) => s.media);
  const connectedAt = useCallStore((s) => s.connectedAt);
  const connection = useCallStore((s) => s.connection);
  const { minimize } = useCallActions();
  const statusText = useCallStatusText();

  // The incoming modal owns "incoming"; this overlay covers the rest — but only when expanded.
  if (phase === "idle" || phase === "incoming" || !peer) return null;
  if (uiMode !== "expanded") return null;

  const name = peer.displayName || peer.username || "Unknown";

  // Video calls get their own full-screen surface; voice keeps the original avatar UI unchanged.
  if (media === "video" && phase !== "ended") {
    return <VideoCallSurface name={name} avatar={peer.avatar} />;
  }

  const ringingPhase = phase === "outgoing" || phase === "connecting";

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
      onClick={minimize}
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

      {/* Tapping the card itself must not minimize — only the backdrop does. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-sm flex-col items-center gap-6 rounded-3xl bg-surface p-8 text-center shadow-elevated"
      >
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

        <CallControls />
      </div>
    </div>
  );
}
