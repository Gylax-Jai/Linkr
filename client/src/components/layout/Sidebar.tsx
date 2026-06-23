import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Ban,
  Check,
  ChevronDown,
  Clock,
  MoreHorizontal,
  Pin,
  PinOff,
  Search,
  ShieldOff,
  Trash2,
  UserMinus,
  UserPlus,
} from "lucide-react";
import type { ChatListItem } from "@linkr/shared";
import { Avatar } from "@/components/ui/Avatar";
import { FriendSearchModal } from "@/features/friends/FriendSearchModal";
import { FriendsPanel } from "@/features/friends";
import { useChatList, useDeleteChatMutation, usePinChatMutation } from "@/features/chat";
import {
  useAcceptFriendRequestMutation,
  useBlockUserMutation,
  useCancelFriendRequestMutation,
  useRemoveFriendMutation,
  useSendFriendRequestMutation,
  useUnblockUserMutation,
} from "@/features/friends";
import { useAuthStore, useUIStore } from "@/lib/store";
import { useDecryptedText } from "@/lib/crypto";
import { formatChatListTime } from "@/lib/utils/formatTime";
import { cn } from "@/lib/utils";

function ChatPreview({ chat, userId }: { chat: ChatListItem; userId: string }) {
  const last = chat.lastMessage;
  // Decrypt the last-message preview when it's an E2EE body (Phase 2). Hook runs unconditionally.
  const body = useDecryptedText(
    last && last.content ? { id: last._id, content: last.content, encrypted: last.encrypted } : null,
  );
  if (!last) return "No messages yet";
  const prefix = last.sender === userId ? "You: " : "";
  if (last.content) {
    if (body.state === "pending") return `${prefix}Decrypting…`;
    if (body.state === "failed") return `${prefix}🔒 Encrypted message`;
    return `${prefix}${body.text}`;
  }
  if (last.mediaType === "image") return `${prefix}📷 Photo`;
  if (last.mediaUrl) return `${prefix}📎 ${last.mediaName ?? "File"}`;
  return "No messages yet";
}

function ChatRow({ chat, active, userId }: { chat: ChatListItem; active: boolean; userId: string }) {
  const setActiveChat = useUIStore((s) => s.setActiveChat);
  const onlineOverrides = useUIStore((s) => s.onlineOverrides);
  const online = onlineOverrides[chat.participant._id] ?? chat.participant.online;
  const pinChat = usePinChatMutation();
  const deleteChat = useDeleteChatMutation();
  const removeFriend = useRemoveFriendMutation();
  const blockUser = useBlockUserMutation();
  const unblockUser = useUnblockUserMutation();
  const sendRequest = useSendFriendRequestMutation();
  const acceptRequest = useAcceptFriendRequestMutation();
  const cancelRequest = useCancelFriendRequestMutation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // Mobile long-press → open the actions menu. `longPressedRef` lets us swallow the click that
  // fires right after the press so a long-press doesn't ALSO open the chat.
  const longPressTimer = useRef<number | null>(null);
  const longPressedRef = useRef(false);

  const startLongPress = () => {
    longPressedRef.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressedRef.current = true;
      setMenuOpen(true);
    }, 500);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  useEffect(() => cancelLongPress, []);

  const participantId = chat.participant._id;
  const friendship = chat.participant.friendship;
  const isFriend = friendship?.status === "accepted";
  const isBlocked = friendship?.status === "blocked";
  const blockedByMe = Boolean(friendship?.blockedByMe);
  const isPending = friendship?.status === "pending";
  const pendingOutgoing = isPending && friendship?.direction === "outgoing";
  const pendingIncoming = isPending && friendship?.direction === "incoming";
  // No friendship (or a stale rejected row) = strangers → offer to add them.
  const isStranger = !isFriend && !isBlocked && !isPending;
  const friendshipId = friendship?.friendshipId;

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        // Swallow the click synthesized right after a long-press (it would re-open the chat).
        if (longPressedRef.current) {
          longPressedRef.current = false;
          return;
        }
        setActiveChat(chat._id);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setActiveChat(chat._id);
        }
      }}
      onTouchStart={startLongPress}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen(true);
      }}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group relative flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 text-left transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        // Lift the row above its siblings while its menu is open so the dropdown isn't painted
        // under the next (later-in-DOM) relatively-positioned row.
        menuOpen && "z-20",
        active ? "bg-primary/10 shadow-soft" : "hover:bg-surface-2",
      )}
    >
      <span
        className={cn(
          "absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-gradient-primary transition-opacity duration-200",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-40",
        )}
        aria-hidden="true"
      />
      <Avatar name={chat.participant.displayName} src={chat.participant.avatar} size="md" online={online} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1">
            {chat.pinned ? <Pin className="h-3 w-3 shrink-0 text-primary" aria-label="Pinned" /> : null}
            <span className={cn("truncate text-sm", active ? "font-semibold text-text" : "font-medium text-text")}>
              {chat.participant.displayName}
            </span>
          </span>
          <span
            className={cn(
              "shrink-0 text-[11px] tabular-nums",
              chat.unreadCount ? "font-medium text-primary" : "text-text-muted",
            )}
          >
            {chat.lastMessage ? formatChatListTime(chat.lastMessage.createdAt) : ""}
          </span>
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className={cn("truncate text-xs", chat.unreadCount ? "font-medium text-text" : "text-text-muted")}>
            <ChatPreview chat={chat} userId={userId} />
          </span>
          {chat.unreadCount > 0 ? (
            <span className="grid h-5 min-w-[1.25rem] shrink-0 place-items-center rounded-full bg-gradient-primary px-1.5 text-[11px] font-semibold text-primary-foreground shadow-glow">
              {chat.unreadCount}
            </span>
          ) : null}
        </span>
      </span>

      <div ref={menuRef} className="absolute right-2 top-1/2 -translate-y-1/2">
        <button
          type="button"
          aria-label="Chat options"
          title="Chat options"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className={cn(
            "hidden place-items-center rounded-full p-1 text-text-muted transition-opacity hover:bg-surface hover:text-text group-hover:grid",
            (menuOpen || chat.pinned) && "grid opacity-100",
          )}
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menuOpen ? (
          <div className="absolute right-0 top-full z-30 mt-1 w-48 rounded-xl border border-border bg-surface p-1 shadow-elevated">
            <ChatMenuItem
              icon={chat.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              onClick={() => {
                pinChat.mutate({ chatId: chat._id, pinned: !chat.pinned });
                setMenuOpen(false);
              }}
            >
              {chat.pinned ? "Unpin chat" : "Pin chat"}
            </ChatMenuItem>

            {isStranger ? (
              <ChatMenuItem
                icon={<UserPlus className="h-4 w-4" />}
                onClick={() => {
                  sendRequest.mutate(participantId);
                  setMenuOpen(false);
                }}
              >
                Add friend
              </ChatMenuItem>
            ) : null}

            {pendingOutgoing && friendshipId ? (
              <ChatMenuItem
                icon={<Clock className="h-4 w-4" />}
                onClick={() => {
                  cancelRequest.mutate(friendshipId);
                  setMenuOpen(false);
                }}
              >
                Cancel request
              </ChatMenuItem>
            ) : null}

            {pendingIncoming && friendshipId ? (
              <ChatMenuItem
                icon={<Check className="h-4 w-4" />}
                onClick={() => {
                  acceptRequest.mutate(friendshipId);
                  setMenuOpen(false);
                }}
              >
                Accept request
              </ChatMenuItem>
            ) : null}

            {isFriend ? (
              <ChatMenuItem
                icon={<UserMinus className="h-4 w-4" />}
                onClick={() => {
                  setMenuOpen(false);
                  if (
                    window.confirm(
                      `Remove ${chat.participant.displayName} from your friends? You won't be able to message until you're friends again.`,
                    )
                  ) {
                    removeFriend.mutate(participantId);
                  }
                }}
              >
                Unfriend
              </ChatMenuItem>
            ) : null}

            {isBlocked && blockedByMe ? (
              <ChatMenuItem
                icon={<ShieldOff className="h-4 w-4" />}
                onClick={() => {
                  unblockUser.mutate(participantId);
                  setMenuOpen(false);
                }}
              >
                Unblock
              </ChatMenuItem>
            ) : !isBlocked ? (
              <ChatMenuItem
                icon={<Ban className="h-4 w-4" />}
                onClick={() => {
                  blockUser.mutate(participantId);
                  setMenuOpen(false);
                }}
              >
                Block
              </ChatMenuItem>
            ) : null}

            <ChatMenuItem
              icon={<Trash2 className="h-4 w-4" />}
              destructive
              onClick={() => {
                setMenuOpen(false);
                if (window.confirm("Delete this chat from your list? The other person keeps their copy.")) {
                  deleteChat.mutate(chat._id);
                }
              }}
            >
              Delete chat
            </ChatMenuItem>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChatMenuItem({
  icon,
  onClick,
  destructive,
  children,
}: {
  icon: ReactNode;
  onClick: () => void;
  destructive?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-surface-2",
        destructive ? "text-red-500" : "text-text",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function ChatSection({
  title,
  chats,
  activeChatId,
  userId,
  defaultOpen = true,
}: {
  title: string;
  chats: ChatListItem[];
  activeChatId: string | null;
  userId: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (chats.length === 0) return null;

  return (
    <div className="px-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-1 flex w-full items-center gap-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted"
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} />
        {title}
        <span className="font-normal text-text-muted/70">({chats.length})</span>
      </button>
      {open ? (
        <div className="space-y-1">
          {chats.map((chat) => (
            <ChatRow key={chat._id} chat={chat} active={activeChatId === chat._id} userId={userId} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Left pane: sticky user row, conversation search, pinned/recent chat list. */
export function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const activeChatId = useUIStore((s) => s.activeChatId);
  const friendSearchOpen = useUIStore((s) => s.friendSearchOpen);
  const openFriendSearch = useUIStore((s) => s.openFriendSearch);
  const closeFriendSearch = useUIStore((s) => s.closeFriendSearch);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"chats" | "friends">("chats");

  const { data: chats = [], isLoading } = useChatList();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter(
      (c) =>
        c.participant.displayName.toLowerCase().includes(q) ||
        c.participant.username?.toLowerCase().includes(q),
    );
  }, [chats, search]);

  const pinned = filtered.filter((c) => c.pinned);
  const recent = filtered.filter((c) => !c.pinned);

  if (!user) return null;

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-surface md:w-80 lg:w-96">
      {/* Sticky user identity row */}
      <div className="sticky top-0 z-10 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Avatar name={user.displayName} src={user.avatar} size="md" online ring />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-text">{user.displayName}</p>
            <p className="truncate font-mono text-xs text-text-muted">
              {user.username ? `@${user.username}` : user.email}
            </p>
          </div>
          <button
            type="button"
            onClick={openFriendSearch}
            aria-label="Find people"
            title="Find people"
            className="grid h-8 w-8 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-primary"
          >
            <UserPlus className="h-4 w-4" />
          </button>
        </div>

        {/* Chats | Friends switch: chats are conversations, Friends is your contact directory. */}
        <div className="mt-3 flex gap-1 rounded-xl bg-surface-2 p-1">
          {(["chats", "friends"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={cn(
                "flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                view === id ? "bg-surface text-text shadow-soft" : "text-text-muted hover:text-text",
              )}
            >
              {id}
            </button>
          ))}
        </div>
      </div>

      {view === "chats" ? (
        <>
          {/* Conversation search (local filter) */}
          <div className="px-3 py-3">
            <div className="group flex items-center gap-2 rounded-2xl border border-transparent bg-surface-2 px-3 py-2.5 text-text-muted transition-colors focus-within:border-primary/40 focus-within:bg-surface focus-within:shadow-soft">
              <Search className="h-4 w-4 transition-colors group-focus-within:text-primary" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations..."
                className="w-full bg-transparent text-sm text-text placeholder:text-text-muted focus:outline-none"
                aria-label="Search conversations"
              />
            </div>
          </div>

          <nav className="flex-1 space-y-3 overflow-y-auto pb-3">
            {isLoading ? (
              <p className="px-4 text-sm text-text-muted">Loading chats…</p>
            ) : filtered.length === 0 ? (
              <p className="px-4 text-sm text-text-muted">
                {search ? "No matching conversations." : "No chats yet — find a friend to start one."}
              </p>
            ) : (
              <>
                <ChatSection title="Pinned" chats={pinned} activeChatId={activeChatId} userId={user._id} />
                <ChatSection title="Recent" chats={recent} activeChatId={activeChatId} userId={user._id} />
              </>
            )}
          </nav>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <FriendsPanel />
        </div>
      )}

      <FriendSearchModal open={friendSearchOpen} onClose={closeFriendSearch} />
    </aside>
  );
}
