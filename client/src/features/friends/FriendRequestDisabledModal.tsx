import { UserX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Portal } from "@/components/ui/Portal";

/** Shown when the target user has disabled incoming friend requests. */
export function FriendRequestDisabledModal({
  name,
  open,
  onClose,
}: {
  name: string;
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
        <button type="button" aria-label="Close" className="absolute inset-0 bg-bg/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative z-10 w-full max-w-sm animate-fade-in-up rounded-t-3xl border border-border bg-surface p-5 shadow-elevated sm:rounded-3xl">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <UserX className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-text">Can't send request</h2>
              <p className="mt-1 text-sm leading-relaxed text-text-muted">
                {name} has disabled friend requests. You won't be able to add them until they change their privacy
                settings.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-text-muted hover:bg-surface-2 hover:text-text"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Button variant="gradient" size="sm" className="mt-4 w-full" onClick={onClose}>
            OK
          </Button>
        </div>
      </div>
    </Portal>
  );
}
