import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, LogOut, Monitor, Smartphone } from "lucide-react";
import type { DeviceSession } from "@linkr/shared";
import { Button } from "@/components/ui/button";
import { useLogoutMutation } from "@/features/auth";
import { PATHS } from "@/routes/paths";
import { cn } from "@/lib/utils";
import {
  useRevokeOtherSessionsMutation,
  useRevokeSessionMutation,
  useSessionsQuery,
} from "./useSessions";

/** Relative "x ago" label for a session's last activity. */
function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "active now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Pick an icon from the device label (phones vs everything else). */
function DeviceIcon({ label }: { label: string }) {
  const isMobile = /Android|iOS/i.test(label);
  return isMobile ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />;
}

/**
 * Devices screen (Sprint E): lists every signed-in session and lets the user revoke them. Revoking
 * the current device signs out here; revoking another makes that device's next refresh fail, so it
 * drops back to the login screen. "Log out all other devices" keeps only this one.
 */
export function SessionsCard() {
  const { data: sessions, isLoading, isError } = useSessionsQuery();
  const revokeOne = useRevokeSessionMutation();
  const revokeOthers = useRevokeOtherSessionsMutation();
  const logout = useLogoutMutation();
  const navigate = useNavigate();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const others = (sessions ?? []).filter((s) => !s.current);

  const handleRevoke = async (session: DeviceSession) => {
    setPendingId(session._id);
    try {
      if (session.current) {
        // Revoking yourself is just a sign-out on this device.
        await logout.mutateAsync();
        navigate(PATHS.login, { replace: true });
        return;
      }
      await revokeOne.mutateAsync(session._id);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-5 shadow-soft">
      <div>
        <h2 className="text-sm font-semibold text-text">Devices</h2>
        <p className="mt-1 text-xs text-text-muted">
          You're signed in on these devices. Sign out any you don't recognize — that device will need to log in again.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading devices…
        </div>
      ) : isError ? (
        <p className="py-2 text-xs text-rose-500">Couldn't load your devices. Please try again.</p>
      ) : (
        <ul className="space-y-2">
          {(sessions ?? []).map((session) => (
            <li
              key={session._id}
              className={cn(
                "flex items-center gap-3 rounded-2xl border border-border bg-surface-2 px-3 py-2.5",
                session.current && "border-primary/40",
              )}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface text-text-muted">
                <DeviceIcon label={session.label} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium text-text">
                  {session.label}
                  {session.current ? (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      This device
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-[11px] text-text-muted">
                  {session.current ? "Active now" : timeAgo(session.lastSeenAt)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 text-text-muted hover:text-rose-500"
                disabled={pendingId === session._id}
                onClick={() => handleRevoke(session)}
              >
                {pendingId === session._id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                <span className="ml-1.5">{session.current ? "Sign out" : "Revoke"}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}

      {others.length > 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={revokeOthers.isPending}
          onClick={() => revokeOthers.mutate()}
        >
          {revokeOthers.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          <span className={revokeOthers.isPending ? "ml-1.5" : ""}>Log out all other devices</span>
        </Button>
      ) : null}
    </section>
  );
}
