import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, Bell, Check, MessageSquare, UserCheck, UserPlus, X } from "lucide-react";
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
  useMarkNotificationsReadMutation,
  useNotifications,
  useUnreadCount,
} from "./useNotifications";

function NotificationIcon({ type }: { type: NotificationDTO["type"] }) {
  if (type === "friend_request") return <UserPlus className="h-3.5 w-3.5" />;
  if (type === "friend_accepted") return <UserCheck className="h-3.5 w-3.5" />;
  return <MessageSquare className="h-3.5 w-3.5" />;
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
          className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-border bg-surface shadow-elevated"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unreadCount > 0 ? (
              <span className="text-xs font-medium text-primary">{unreadCount} new</span>
            ) : null}
          </div>

          <div className="max-h-96 overflow-y-auto">
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
  const [resolution, setResolution] = useState<"accepted" | "rejected" | "blocked" | null>(null);

  const { title, sub } = notificationText(n);
  const isFriendRequest = n.type === "friend_request";
  const canAct = isFriendRequest && Boolean(n.friendshipId) && Boolean(n.actor?._id);
  const pending = accept.isPending || reject.isPending || block.isPending;

  const refreshNotifications = () => {
    void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  };

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
        <div className="flex items-start gap-3">{inner}</div>
        <div className="mt-2 flex items-center gap-2 pl-11">
          {resolution ? (
            <span className="text-xs font-medium capitalize text-text-muted">{resolution}</span>
          ) : canAct ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  accept.mutate(n.friendshipId!, {
                    onSuccess: () => {
                      setResolution("accepted");
                      refreshNotifications();
                    },
                  })
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
                  reject.mutate(n.friendshipId!, {
                    onSuccess: () => {
                      setResolution("rejected");
                      refreshNotifications();
                    },
                  })
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
                  block.mutate(n.actor!._id, {
                    onSuccess: () => {
                      setResolution("blocked");
                      refreshNotifications();
                    },
                  })
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
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(n)}
        className={cn(
          "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2",
          !n.read && "bg-primary/5",
        )}
      >
        {inner}
      </button>
    </li>
  );
}
