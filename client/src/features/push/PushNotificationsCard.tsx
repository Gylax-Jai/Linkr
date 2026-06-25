import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "./usePushNotifications";

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

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        {push.enabled ? <Bell className="mt-0.5 h-5 w-5 text-primary" /> : <BellOff className="mt-0.5 h-5 w-5 text-text-muted" />}
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="font-medium">Background notifications</p>
            <p className="text-sm text-text-muted">
              Get alerts when Linkr is closed or in the background. Message previews stay generic to protect E2EE.
            </p>
          </div>
          {push.error ? <p className="text-sm text-red-500">{push.error}</p> : null}
          <div className="flex flex-wrap gap-2">
            {push.enabled ? (
              <Button type="button" variant="ghost" size="sm" disabled={push.busy} onClick={() => void push.disable()}>
                Turn off
              </Button>
            ) : (
              <Button type="button" variant="gradient" size="sm" disabled={push.busy} onClick={() => void push.enable()}>
                Enable notifications
              </Button>
            )}
          </div>
          <p className="text-xs text-text-muted">
            Tip: install Linkr from your browser menu (Add to Home Screen / Install app) for the best mobile experience.
          </p>
        </div>
      </div>
    </div>
  );
}
