import { Phone, PhoneOff } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { useCallStore } from "@/lib/store";
import { useCallActions } from "./CallProvider";

/** Full-screen ringing prompt shown to the callee until they accept or reject. */
export function IncomingCallModal() {
  const phase = useCallStore((s) => s.phase);
  const peer = useCallStore((s) => s.peer);
  const media = useCallStore((s) => s.media);
  const { acceptCall, rejectCall } = useCallActions();

  if (phase !== "incoming" || !peer) return null;

  const name = peer.displayName || peer.username || "Unknown";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Incoming ${media} call from ${name}`}
      className="fixed inset-0 z-[120] grid place-items-center bg-black/80 p-4 backdrop-blur-sm animate-fade-in-up"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-3xl bg-surface p-8 text-center shadow-elevated">
        <div className="relative">
          <span className="avatar-pulse-ring absolute inset-0 rounded-full" aria-hidden="true" />
          <Avatar name={name} src={peer.avatar} size="xl" />
        </div>
        <div className="space-y-1">
          <p className="text-lg font-semibold text-text">{name}</p>
          <p className="text-sm text-text-muted">
            Incoming {media === "video" ? "video" : "voice"} call…
          </p>
        </div>
        <div className="flex items-center gap-10">
          <button
            type="button"
            onClick={rejectCall}
            aria-label="Decline call"
            className="grid h-16 w-16 place-items-center rounded-full bg-red-500 text-white shadow-elevated transition-transform hover:scale-105 active:scale-95"
          >
            <PhoneOff className="h-7 w-7" />
          </button>
          <button
            type="button"
            onClick={acceptCall}
            aria-label="Accept call"
            className="grid h-16 w-16 place-items-center rounded-full bg-online text-white shadow-elevated transition-transform hover:scale-105 active:scale-95"
          >
            <Phone className="h-7 w-7" />
          </button>
        </div>
      </div>
    </div>
  );
}
