import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Ban, Bell, Check, MessageSquare, Trash2, UserCheck, UserPlus, X } from "lucide-react";
import type { NotificationDTO } from "@linkr/shared";
import { Avatar } from "@/components/ui/Avatar";
import {
  useAcceptFriendRequestMutation,
  useBlockUserMutation,
  useRejectFriendRequestMutation,
} from "@/features/friends";
import { useUIStore } from "@/lib/store";
import { formatChatListTime } from "@/lib/utils/formatTime";
import { cn } from "@/lib/utils";
import {
  notificationKeys,
  useClearAllNotificationsMutation,
  useDeleteNotificationMutation,
  useMarkNotificationsReadMutation,
  useNotifications,
  useUnreadCount,
} from "./useNotifications";

function NotificationIcon({ type }: { type: NotificationDTO["type"] }) {
  if (type === "friend_request") return <UserPlus className="h-3.5 w-3.5" />;
  if (type === "friend_accepted") return <UserCheck className="h-3.5 w-3.5" />;
  return <MessageSquare className="h-3.5 w-3.5" />;
}

/** Friendly message for a failed Accept/Reject/Block — surfaces the server reason when present. */
function actionErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    if (typeof data?.error === "string" && data.error.trim()) return data.error;
    const status = err.response?.status;
    // The request was already handled elsewhere (duplicate row / other device).
    if (status === 400 || status === 404) return "This request was already handled.";
    if (!err.response) return "Network error — check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}

function notificationText(n: NotificationDTO): { title: string; sub?: string } {
  const who = n.actor?.displayName ?? "Someone";
  if (n.type === "friend_request") return { title: `${who} sent you a friend request` };
  if (n.type === "friend_accepted") return { title: `${who} accepted your friend request` };
  return { title: who, sub: n.messagePreview ?? "sent you a message" };
}

/** Header notification center: bell + unread badge + dropdown list (Sprint 5). */
export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const setActiveChat = useUIStore((s) => s.setActiveChat);
  const setDetailsOpen = useUIStore((s) => s.setDetailsOpen);
  const openMobileDetails = useUIStore((s) => s.openMobileDetails);

  const { data: notifications = [], isLoading } = useNotifications();
  const { data: unreadCount = 0 } = useUnreadCount();
  const markRead = useMarkNotificationsReadMutation();
  const clearAll = useClearAllNotificationsMutation();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleToggle = () => {
    setOpen((prev) => {
      const next = !prev;
      // Mark everything read when the panel is opened.
      if (next && unreadCount > 0 && !markRead.isPending) markRead.mutate();
      return next;
    });
  };

  const handleItemClick = (n: NotificationDTO) => {
    if (n.type === "message" && n.chatId) {
      setActiveChat(n.chatId);
    } else {
      // Friend notifications live in the friends panel (details pane) — open the desktop aside and,
      // on mobile, the slide-up details sheet (only shows when there's an active chat).
      setDetailsOpen(true);
      openMobileDetails();
    }
    setOpen(false);
  };

  const badge = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notifications"
        className={cn(
          "relative grid h-9 w-9 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-text",
          open && "bg-surface-2 text-text",
        )}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[1rem] place-items-center rounded-full bg-gradient-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground shadow-glow">
            {badge}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className={cn(
            // Mobile: anchor to the viewport (fixed) and span the width minus small gutters so the
            // 20rem desktop panel can't overflow a 360px screen. Desktop (sm+): classic dropdown
            // anchored under the bell.
            "fixed inset-x-2 top-16 z-50 overflow-hidden rounded-2xl border border-border bg-surface shadow-elevated",
            "sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80",
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">Notifications</p>
              {unreadCount > 0 ? (
                <span className="text-xs font-medium text-primary">{unreadCount} new</span>
              ) : null}
            </div>
            {notifications.length > 0 ? (
              <button
                type="button"
                onClick={() => !clearAll.isPending && clearAll.mutate()}
                disabled={clearAll.isPending}
                className="text-xs font-medium text-text-muted transition-colors hover:text-text disabled:opacity-50"
              >
                Clear all
              </button>
            ) : null}
          </div>

          <div className="max-h-[70vh] overflow-y-auto sm:max-h-96">
            {isLoading ? (
              <p className="px-4 py-6 text-center text-sm text-text-muted">Loading…</p>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto h-8 w-8 text-text-muted/40" />
                <p className="mt-3 text-sm font-medium text-text">You're all caught up</p>
                <p className="mt-1 text-xs text-text-muted">New activity will show up here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {notifications.map((n) => (
                  <NotificationRow key={n._id} notification={n} onOpen={handleItemClick} />
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** A single notification row: friend requests get inline Accept/Reject/Block; others stay clickable. */
function NotificationRow({
  notification: n,
  onOpen,
}: {
  notification: NotificationDTO;
  onOpen: (n: NotificationDTO) => void;
}) {
  const queryClient = useQueryClient();
  const accept = useAcceptFriendRequestMutation();
  const reject = useRejectFriendRequestMutation();
  const block = useBlockUserMutation();
  const deleteNotification = useDeleteNotificationMutation();
  const [resolution, setResolution] = useState<"accepted" | "rejected" | "blocked" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { title, sub } = notificationText(n);
  const isFriendRequest = n.type === "friend_request";
  const canAct = isFriendRequest && Boolean(n.friendshipId) && Boolean(n.actor?._id);
  const pending = accept.isPending || reject.isPending || block.isPending;

  /**
   * Remove every actionable friend_request row that this action just resolved — not only the row
   * that was clicked. A single request can have duplicate rows (and the same person can appear in
   * several), so we purge by `friendshipId` (accept/reject) or `actor` (block) from the cache and
   * fix the unread count, then refetch for the server's truth.
   */
  const purgeResolved = (match: (other: NotificationDTO) => boolean) => {
    let removedUnread = 0;
    queryClient.setQueryData<NotificationDTO[]>(notificationKeys.list(), (old) => {
      if (!old) return old;
      return old.filter((row) => {
        const remove = row.type === "friend_request" && match(row);
        if (remove && !row.read) removedUnread += 1;
        return !remove;
      });
    });
    if (removedUnread > 0) {
      queryClient.setQueryData<number>(notificationKeys.unread(), (count) =>
        Math.max(0, (count ?? 0) - removedUnread),
      );
    }
    void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  };

  const handleError = (resolved: typeof resolution, err: unknown) => {
    // Roll back the optimistic label so the buttons return, and surface why it failed.
    if (resolution === resolved) setResolution(null);
    setError(actionErrorMessage(err));
    void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  };

  /**
   * "Click and done": flip the row to its resolved label *immediately* (optimistic) so it feels
   * instant, then run the mutation in the background. On success, purge any duplicate rows; on
   * error, roll the label back and show the reason.
   */
  const runAction = (
    resolved: NonNullable<typeof resolution>,
    mutate: () => Promise<unknown>,
    match: (other: NotificationDTO) => boolean,
  ) => {
    if (pending || resolution) return;
    setError(null);
    setResolution(resolved);
    mutate()
      .then(() => purgeResolved(match))
      .catch((err) => handleError(resolved, err));
  };

  const deleteButton = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!deleteNotification.isPending) deleteNotification.mutate(n._id);
      }}
      disabled={deleteNotification.isPending}
      aria-label="Delete notification"
      title="Delete notification"
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-red-500 disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );

  const inner = (
    <>
      <span className="relative shrink-0">
        <Avatar name={n.actor?.displayName ?? "Linkr"} src={n.actor?.avatar} size="sm" />
        <span className="absolute -bottom-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-surface text-primary">
          <NotificationIcon type={n.type} />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-text">{title}</span>
        {sub ? <span className="block truncate text-xs text-text-muted">{sub}</span> : null}
        <span className="mt-0.5 block text-[11px] text-text-muted">{formatChatListTime(n.createdAt)}</span>
      </span>
      {!n.read ? (
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-gradient-primary" aria-hidden="true" />
      ) : null}
    </>
  );

  if (isFriendRequest) {
    return (
      <li className={cn("px-4 py-3", !n.read && "bg-primary/5")}>
        <div className="flex items-start gap-3">
          {inner}
          {deleteButton}
        </div>
        <div className="mt-2 flex items-center gap-2 pl-11">
          {resolution ? (
            <span className="text-xs font-medium capitalize text-text-muted">{resolution}</span>
          ) : canAct ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  runAction(
                    "accepted",
                    () => accept.mutateAsync(n.friendshipId!),
                    (o) => o.friendshipId === n.friendshipId,
                  )
                }
                className="inline-flex items-center gap-1 rounded-full bg-gradient-primary px-3 py-1 text-xs font-semibold text-primary-foreground shadow-soft transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Check className="h-3 w-3" />
                Accept
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  runAction(
                    "rejected",
                    () => reject.mutateAsync(n.friendshipId!),
                    (o) => o.friendshipId === n.friendshipId,
                  )
                }
                className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-50"
              >
                <X className="h-3 w-3" />
                Reject
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  runAction(
                    "blocked",
                    () => block.mutateAsync(n.actor!._id),
                    (o) => o.actor?._id === n.actor?._id,
                  )
                }
                aria-label="Block user"
                title="Block user"
                className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-50"
              >
                <Ban className="h-3 w-3" />
              </button>
            </>
          ) : (
            <span className="text-xs text-text-muted">Open the friends panel to respond.</span>
          )}
        </div>
        {error ? (
          <p className="mt-1.5 pl-11 text-xs text-red-500" role="alert">
            {error}
          </p>
        ) : null}
      </li>
    );
  }

  return (
    <li className={cn("flex items-stretch", !n.read && "bg-primary/5")}>
      <button
        type="button"
        onClick={() => onOpen(n)}
        className="flex min-w-0 flex-1 items-start gap-3 py-3 pl-4 text-left transition-colors hover:bg-surface-2"
      >
        {inner}
      </button>
      <div className="flex items-center pr-2">{deleteButton}</div>
    </li>
  );
}
