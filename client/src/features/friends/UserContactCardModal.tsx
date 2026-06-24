import { X } from "lucide-react";
import type { UserSearchResult } from "@linkr/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Portal } from "@/components/ui/Portal";
import { FriendActions } from "./FriendActions";

/** Contact card for a user found via search — avatar, name, @username, and friend actions. */
export function UserContactCardModal({
  user,
  onClose,
}: {
  user: UserSearchResult | null;
  onClose: () => void;
}) {
  if (!user) return null;

  const handle = user.username ? `@${user.username}` : user.displayName;

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
        <button type="button" aria-label="Close" className="absolute inset-0 bg-bg/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative z-10 w-full max-w-sm animate-fade-in-up rounded-t-3xl border border-border bg-surface shadow-elevated sm:rounded-3xl">
          <div className="flex justify-end p-3 pb-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close contact card"
              className="grid h-8 w-8 place-items-center rounded-full text-text-muted hover:bg-surface-2 hover:text-text"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-col items-center gap-3 px-6 pb-6 pt-2 text-center">
            <Avatar name={user.displayName} src={user.avatar} size="xl" ring zoomable />
            <div className="space-y-1">
              <p className="text-lg font-semibold tracking-tight">{user.displayName}</p>
              <p className="font-mono text-xs text-text-muted">{handle}</p>
            </div>
            <p className="max-w-xs text-xs leading-relaxed text-text-muted">
              {user.friendship?.status === "accepted"
                ? "You're friends — message or call anytime."
                : "Send a friend request to start chatting on Linkr."}
            </p>
            <div className="pt-1">
              <FriendActions user={user} onRequestBlocked={onClose} />
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
