import { Bell, BellOff, Loader2 } from "lucide-react";
import { usePushNotifications } from "./usePushNotifications";
import { cn } from "@/lib/utils";

/** Settings card to enable/disable background web push (Phase 5 / 7B). */
export function PushNotificationsCard() {
  const push = usePushNotifications();

  if (!push.supported) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-4 text-sm text-text-muted">
        Background notifications require a browser that supports Web Push and an installed PWA.
      </div>
    );
  }

  const statusLabel = push.blocked ? "Blocked" : push.enabled ? "On" : "Off";
  const statusClass = push.blocked
    ? "text-red-500"
    : push.enabled
      ? "text-emerald-500"
      : "text-text-muted";

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        {push.enabled ? (
          <Bell className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        ) : (
          <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" />
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">Background notifications</p>
              <p className="text-sm text-text-muted">
                Alerts when Linkr is closed or in the background. In-app bell handles notifications while you are here.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={push.enabled}
              aria-label={push.enabled ? "Turn off background notifications" : "Turn on background notifications"}
              disabled={push.busy || push.blocked}
              onClick={() => void push.toggle()}
              className={cn(
                "relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                push.enabled ? "bg-primary" : "bg-surface-2",
                (push.busy || push.blocked) && "cursor-not-allowed opacity-60",
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 grid h-6 w-6 place-items-center rounded-full bg-white shadow-sm transition-transform duration-200 ease-out",
                  push.enabled && "translate-x-5",
                )}
              >
                {push.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" /> : null}
              </span>
            </button>
          </div>

          <p className={cn("text-xs font-medium", statusClass)}>
            {statusLabel}
            {push.blocked ? " — allow notifications in your browser settings, then refresh." : null}
          </p>

          {push.error ? <p className="text-sm text-red-500">{push.error}</p> : null}

          <p className="text-xs text-text-muted">
            Tip: install Linkr from your browser menu (Add to Home Screen / Install app) for the best mobile experience.
          </p>
        </div>
      </div>
    </div>
  );
}
