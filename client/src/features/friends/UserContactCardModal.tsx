import { X } from "lucide-react";
import type { UserSearchResult } from "@linkr/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Portal } from "@/components/ui/Portal";
import { formatLastSeen } from "@/lib/utils/formatTime";
import { FriendActions } from "./FriendActions";
import { useUserProfile } from "./useFriends";

/** Contact card for a user found via search — avatar, bio, presence, and friend actions. */
export function UserContactCardModal({
  user,
  onClose,
}: {
  user: UserSearchResult | null;
  onClose: () => void;
}) {
  const { data: profile } = useUserProfile(user?._id ?? null);
  const view = profile ?? user;
  if (!view) return null;

  const showAvatar = view.contactCardVisible !== false;
  const showBio = view.profileDetailsVisible && view.bio?.trim();
  const showStatus = view.profileDetailsVisible && view.status?.trim();
  const presenceLine = view.presenceVisible
    ? view.online
      ? "Online"
      : formatLastSeen(view.lastSeen) ?? "Offline"
    : null;

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
            <Avatar
              name={view.displayName}
              src={showAvatar ? view.avatar : undefined}
              size="xl"
              ring
              zoomable={view.avatarZoomable === true}
            />
            <div className="space-y-1">
              <p className="text-lg font-semibold tracking-tight">{view.displayName}</p>
              {view.username ? (
                <p className="font-mono text-xs text-text-muted">@{view.username}</p>
              ) : null}
              {presenceLine ? (
                <p className={`text-xs ${view.online ? "text-success" : "text-text-muted"}`}>
                  {presenceLine}
                </p>
              ) : null}
            </div>
            {showStatus ? (
              <p className="rounded-full bg-surface-2 px-3 py-1 text-xs text-text">{view.status}</p>
            ) : null}
            {showBio ? (
              <p className="max-w-xs text-sm leading-relaxed text-text-muted">{view.bio}</p>
            ) : null}
            {!showAvatar ? (
              <p className="max-w-xs text-xs leading-relaxed text-text-muted">
                This user keeps their profile photo private.
              </p>
            ) : null}
            <p className="max-w-xs text-xs leading-relaxed text-text-muted">
              {view.friendship?.status === "accepted"
                ? "You're friends — message or call anytime."
                : "Send a friend request to start chatting on Linkr."}
            </p>
            <div className="pt-1">
              <FriendActions user={view} onRequestBlocked={onClose} />
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
