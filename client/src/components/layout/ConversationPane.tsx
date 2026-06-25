import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Ban,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Copy,
  CornerUpLeft,
  Download,
  FileText,
  Flag,
  Forward,
  Info,
  Loader2,
  MoreVertical,
  NotepadText,
  Paperclip,
  Pencil,
  Phone,
  PhoneMissed,
  PhoneIncoming,
  PhoneOutgoing,
  Quote,
  Search,
  ChevronUp,
  ChevronDown,
  Send,
  Share2,
  ShieldOff,
  Smile,
  SmilePlus,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  Video,
  X,
} from "lucide-react";
import { isAxiosError } from "axios";
import type { ChatListItem, ChatParticipantFriendship, MessageDTO } from "@linkr/shared";
import { MEDIA_ACCEPT, MEDIA_ACCEPT_LABEL, MEDIA_FILE_MAX_BYTES, MEDIA_IMAGE_MAX_BYTES } from "@linkr/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/button";
import { EncryptedBadge } from "@/components/ui/EncryptedBadge";
import {
  downloadMessageMedia,
  emitTyping,
  emitTypingStop,
  ForwardMessageModal,
  MessageMedia,
  useArchiveChatMutation,
  useChatById,
  useDeleteMessageMutation,
  useEditMessageMutation,
  useMarkReadMutation,
  useMessages,
  useMuteChatMutation,
  useReactMessageMutation,
  useSendMessageMutation,
  useUploadMediaMutation,
  useChatInMessageSearch,
} from "@/features/chat";
import {
  ReportUserModal,
  FriendRequestDisabledModal,
  useAcceptFriendRequestMutation,
  useBlockUserMutation,
  useCancelFriendRequestMutation,
  useRemoveFriendMutation,
  useSendFriendRequestMutation,
  useUnblockUserMutation,
} from "@/features/friends";
import { useAuthStore, useUIStore } from "@/lib/store";
import { useCallActions } from "@/features/calls";
import { useTheme } from "@/lib/theme";
import { useDecryptedText, usePeerHasKey } from "@/lib/crypto";
import { EmojiPickerPopover } from "@/features/chat/EmojiPicker";
import { bubbleRadiusClasses, getBubblePosition } from "@/lib/utils/bubbleGrouping";
import { formatDayLabel, formatMessageTime } from "@/lib/utils/formatTime";
import { canShowProfileDetails, getPresenceLabel, showOnlineDot } from "@/lib/utils/privacy";
import { shareContact } from "@/lib/utils/share";
import { getApiErrorCode } from "@/lib/utils/apiError";
import { cn } from "@/lib/utils";
import { highlightText } from "@/lib/utils/highlightText";
import {
  chatAvatarSrc,
  chatDisplayName,
  isGroupChat,
  isSelfChatItem,
  memberNameById,
} from "@/lib/utils/chatDisplay";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/**
 * Turn an upload failure into a specific, user-facing message: prefer the server's own `{ error }`
 * (e.g. unsupported type, content/extension mismatch), then fall back by HTTP status.
 */
function uploadErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    if (typeof data?.error === "string" && data.error.trim()) return data.error;
    const status = err.response?.status;
    if (status === 413) return "That file is too large to upload.";
    if (status === 415) return `That file type isn't supported. Accepted types: ${MEDIA_ACCEPT_LABEL}.`;
    if (status === 403) return "You can only send attachments to friends.";
    if (!err.response) return "Network error — check your connection and try again.";
  }
  return "Upload failed. Please try again.";
}

/** Human-readable size for the staged-file chip (mirrors the formatter used by MessageMedia). */
function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

/** Local UI state for which message is being replied to / edited. */
interface ComposerTarget {
  replyTo: MessageDTO | null;
  editing: MessageDTO | null;
}

/** Center pane: active conversation with grouped bubbles and live messaging. */
export function ConversationPane() {
  const activeChatId = useUIStore((s) => s.activeChatId);
  const setActiveChat = useUIStore((s) => s.setActiveChat);
  const sessionUser = useAuthStore((s) => s.user);
  const chat = useChatById(activeChatId);
  const [target, setTarget] = useState<ComposerTarget>({ replyTo: null, editing: null });
  // Message currently being forwarded (Phase 4) — drives the friend-picker modal. Null = closed.
  const [forwardTarget, setForwardTarget] = useState<MessageDTO | null>(null);
  // WhatsApp-style status strip (Sprint F): visible while viewing the latest messages, slides away as
  // you scroll up through history, and returns when you're back at the bottom.
  const [statusVisible, setStatusVisible] = useState(true);
  const scrollChatToBottomRef = useRef<() => void>(() => {});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const { data: searchMessages = [] } = useMessages(activeChatId);
  const { matchIds } = useChatInMessageSearch(activeChatId, searchMessages, searchQuery, searchOpen);
  const activeMatchId = matchIds[matchIndex] ?? null;

  // Reset per-chat UI (reply/edit target + status strip) whenever the active chat changes.
  useEffect(() => {
    setTarget({ replyTo: null, editing: null });
    setForwardTarget(null);
    setStatusVisible(true);
    setSearchOpen(false);
    setSearchQuery("");
    setMatchIndex(0);
  }, [activeChatId]);

  useEffect(() => {
    setMatchIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (matchIds.length === 0) {
      setMatchIndex(0);
      return;
    }
    if (matchIndex >= matchIds.length) setMatchIndex(matchIds.length - 1);
  }, [matchIds.length, matchIndex]);

  const openSearch = () => {
    setSearchOpen(true);
    setSearchQuery("");
    setMatchIndex(0);
  };

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
    setMatchIndex(0);
  };

  const goNextMatch = () => {
    if (!matchIds.length) return;
    setMatchIndex((i) => (i + 1) % matchIds.length);
  };

  const goPrevMatch = () => {
    if (!matchIds.length) return;
    setMatchIndex((i) => (i - 1 + matchIds.length) % matchIds.length);
  };

  if (!activeChatId) {
    return <EmptyState />;
  }

  if (!chat) {
    return (
      <section className="flex h-full flex-1 flex-col items-center justify-center bg-bg">
        <p className="text-sm text-text-muted">Loading conversation…</p>
      </section>
    );
  }

  const isSelf = isSelfChatItem(chat);
  const isGroup = isGroupChat(chat);
  const status = (isSelf ? sessionUser?.status : chat.participant?.status)?.trim() ?? "";

  return (
    <section className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-bg">
      <ConversationHeader
        chat={chat}
        onBack={() => setActiveChat(null)}
        status={status}
        statusVisible={statusVisible}
        searchOpen={searchOpen}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        matchCount={matchIds.length}
        matchIndex={matchIndex}
        onNextMatch={goNextMatch}
        onPrevMatch={goPrevMatch}
        onOpenSearch={openSearch}
        onCloseSearch={closeSearch}
      />
      <MessageList
        chatId={activeChatId}
        chat={chat}
        isSelf={isSelf}
        isGroup={isGroup}
        participant={chat.participant}
        onReply={(m) => setTarget({ replyTo: m, editing: null })}
        onEdit={(m) => setTarget({ replyTo: null, editing: m })}
        onForward={(m) => setForwardTarget(m)}
        onAtBottomChange={setStatusVisible}
        onRegisterScrollToBottom={(fn) => {
          scrollChatToBottomRef.current = fn;
        }}
        searchQuery={searchOpen ? searchQuery : ""}
        activeMatchId={searchOpen ? activeMatchId : null}
      />
      <Composer
        chatId={activeChatId}
        participantId={chat.participant?._id ?? ""}
        participantName={chat.participant?.displayName ?? chatDisplayName(chat)}
        friendship={chat.participant?.friendship}
        isSelf={isSelf}
        isGroup={isGroup}
        target={target}
        onClearTarget={() => setTarget({ replyTo: null, editing: null })}
        scrollToBottom={() => scrollChatToBottomRef.current()}
      />
      <ForwardMessageModal message={forwardTarget} onClose={() => setForwardTarget(null)} />
    </section>
  );
}

/** Shared "typing…" label with animated dots — used in the header and above the composer. */
function TypingLabel({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center", className)}>
      typing
      <span className="typing-dots" aria-hidden="true">
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </span>
  );
}

/**
 * Bottom-of-thread typing row — rendered inside the scroll area so it sits below timestamps
 * (never overlapping "4:42 am") and scrolls with the message list.
 */
function TypingRow() {
  return (
    <div className="mt-7 mb-2 pl-0.5">
      <span className="inline-flex rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-primary shadow-soft">
        <TypingLabel />
      </span>
    </div>
  );
}

/**
 * Mobile-only WhatsApp-style status bubble (Sprint G.2): a small speech bubble that hangs directly
 * under the contact's avatar with an upward tail pointing into the photo — NOT a full-width bar or a
 * detached pill. Absolutely positioned under the avatar so it reads as "attached" to the picture.
 * Collapses (opacity + slide) when scrolled away from the latest messages; the header reserves space
 * for it via padding so messages never jump. On sm+ the compact header `StatusChip` covers this.
 */
function AvatarStatusBubble({ status, visible }: { status: string; visible: boolean }) {
  return (
    <div
      aria-hidden={!visible}
      className={cn(
        // Overlay anchored to the avatar's left edge, hanging just below the header (Sprint H): it sits
        // ON TOP of the thread (no reserved space) and the tail points up into the avatar.
        "pointer-events-none absolute left-0 top-full z-30 mt-1 transition-all duration-300 ease-out",
        visible ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0",
      )}
    >
      {/* Upward tail: a small rotated square tucked under the avatar center, sharing the surface. */}
      <span
        aria-hidden="true"
        className="absolute -top-1 left-3.5 h-2.5 w-2.5 -translate-x-1/2 rotate-45 rounded-[2px] border-l border-t border-border bg-surface-2"
      />
      <div className="relative max-w-[min(220px,calc(100vw-7rem))] rounded-xl border border-border bg-surface-2 px-3 py-1 shadow-elevated">
        <p className="truncate text-xs font-medium text-text">{status}</p>
      </div>
    </div>
  );
}

function ConversationHeader({
  chat,
  onBack,
  status,
  statusVisible,
  searchOpen,
  searchQuery,
  onSearchQueryChange,
  matchCount,
  matchIndex,
  onNextMatch,
  onPrevMatch,
  onOpenSearch,
  onCloseSearch,
}: {
  chat: ChatListItem;
  onBack: () => void;
  /** Custom status to surface as the under-avatar bubble on mobile (empty = none). */
  status: string;
  /** Scroll-linked visibility for the mobile status bubble (Sprint F/G). */
  statusVisible: boolean;
  searchOpen: boolean;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  matchCount: number;
  matchIndex: number;
  onNextMatch: () => void;
  onPrevMatch: () => void;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
}) {
  const typingByChat = useUIStore((s) => s.typingByChat);
  const onlineOverrides = useUIStore((s) => s.onlineOverrides);
  const detailsOpen = useUIStore((s) => s.detailsOpen);
  const mobileDetailsOpen = useUIStore((s) => s.mobileDetailsOpen);
  const setDetailsOpen = useUIStore((s) => s.setDetailsOpen);
  const openMobileDetails = useUIStore((s) => s.openMobileDetails);
  const closeMobileDetails = useUIStore((s) => s.closeMobileDetails);
  const online = chat.participant ? (onlineOverrides[chat.participant._id] ?? chat.participant.online) : false;
  const isTyping = typingByChat[chat._id];
  const isGroup = isGroupChat(chat);
  const isSelf = isSelfChatItem(chat);
  const title = chatDisplayName(chat);
  const avatarSrc = chatAvatarSrc(chat);
  const presenceLabel = chat.participant ? getPresenceLabel(chat.participant, online) : null;
  const showDot = chat.participant && !isSelf && !isGroup ? showOnlineDot(chat.participant, online) : false;
  const showStatus = chat.participant ? canShowProfileDetails(chat.participant) : false;
  const peerId = chat.participant?._id ?? "";
  const peerHasKey = usePeerHasKey(peerId);
  const e2ee = !isGroup && peerHasKey === true;

  const { startCall } = useCallActions();
  const canCall = !isSelf && !isGroup && chat.participant?.friendship?.status === "accepted";
  const callPeer = chat.participant
    ? {
        _id: chat.participant._id,
        username: chat.participant.username,
        displayName: chat.participant.displayName,
        avatar: chat.participant.avatar,
      }
    : null;
  const startVoiceCall = () => callPeer && startCall({ chatId: chat._id, peer: callPeer, media: "audio" });
  const startVideoCall = () => callPeer && startCall({ chatId: chat._id, peer: callPeer, media: "video" });

  // Clicking the name/avatar always reveals the profile (desktop aside + mobile/tablet sheet).
  const openDetails = () => {
    setDetailsOpen(true);
    openMobileDetails();
  };

  // The ⋮ "Contact info" TOGGLES the profile pane (open if closed, close if already open). The
  // active surface differs by breakpoint — the static aside (lg+) vs the slide-in sheet (< lg).
  const toggleDetails = () => {
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    if (isDesktop) {
      setDetailsOpen(!detailsOpen);
    } else if (mobileDetailsOpen) {
      closeMobileDetails();
    } else {
      openMobileDetails();
    }
  };

  return (
    <div
      className={cn(
        // Fixed 64px bar; the status bubble (mobile) is an OVERLAY that hangs below via overflow-visible
        // so it never reserves space or pushes messages down (Sprint H). z-30 keeps it above the thread.
        // sticky top-0 keeps it pinned if the soft keyboard tries to scroll the column (Sprint I).
        "sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 overflow-visible border-b border-border bg-surface/80 px-3 shadow-soft backdrop-blur-sm safe-top sm:gap-3 sm:px-4",
      )}
    >
      {searchOpen ? (
        <ChatHeaderSearchBar
          query={searchQuery}
          onQueryChange={onSearchQueryChange}
          matchCount={matchCount}
          matchIndex={matchIndex}
          onNext={onNextMatch}
          onPrev={onPrevMatch}
          onClose={onCloseSearch}
        />
      ) : (
        <>
      <Button variant="ghost" size="icon" className="shrink-0 md:hidden" onClick={onBack} aria-label="Back to chat list">
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <button
        type="button"
        onClick={openDetails}
        aria-label="View contact info"
        title="View contact info"
        className="-ml-1 flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-1 text-left transition-colors hover:bg-surface-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3"
      >
        <span className="relative shrink-0">
          <Avatar
            name={title}
            src={avatarSrc}
            size="sm"
            online={showDot}
            icon={
              isSelf ? (
                <NotepadText className="h-4 w-4" />
              ) : isGroup ? (
                <Users className="h-4 w-4" />
              ) : undefined
            }
          />
          {/* WhatsApp-style status hanging under the avatar (mobile only). */}
          {status ? (
            <span className="sm:hidden">
              <AvatarStatusBubble status={status} visible={statusVisible} />
            </span>
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          {isSelf ? (
            <p className="truncate text-xs text-text-muted">Message yourself</p>
          ) : isGroup ? (
            <p className="truncate text-xs text-text-muted">
              {isTyping ? (
                <span className="text-primary">
                  <TypingLabel />
                </span>
              ) : (
                `${chat.group?.memberCount ?? 0} members`
              )}
            </p>
          ) : isTyping ? (
            <p className="truncate text-xs text-primary">
              <TypingLabel />
            </p>
          ) : presenceLabel ? (
            <p className="truncate font-mono text-xs text-text-muted">{presenceLabel}</p>
          ) : null}
        </div>
      </button>
      {!isGroup && showStatus && chat.participant?.status?.trim() ? (
        <StatusChip status={chat.participant.status.trim()} />
      ) : null}
      <EncryptedBadge iconOnly e2ee={e2ee} group={isGroup} />
      <div className="flex shrink-0 items-center gap-0.5">
        {!isGroup ? (
          <>
        <CallButton
          label="Voice call"
          icon={<Phone className="h-4 w-4" />}
          disabled={!canCall}
          onClick={canCall ? startVoiceCall : undefined}
        />
        <CallButton
          label="Video call"
          icon={<Video className="h-4 w-4" />}
          disabled={!canCall}
          onClick={canCall ? startVideoCall : undefined}
        />
          </>
        ) : null}
        <CallButton
          label="Search in chat"
          icon={<Search className="h-4 w-4" />}
          onClick={onOpenSearch}
          className="hidden sm:grid"
        />
        <HeaderMenu chat={chat} onViewInfo={toggleDetails} onOpenSearch={onOpenSearch} />
        <button
          type="button"
          onClick={onBack}
          aria-label="Close conversation"
          title="Close conversation"
          className="hidden h-9 w-9 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-text md:grid"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
        </>
      )}
    </div>
  );
}

/**
 * Compact in-header search bar (Phase 6C): filters the open chat client-side over decrypted text.
 * Desktop opens via the header Search icon; mobile via the ⋮ menu.
 */
function ChatHeaderSearchBar({
  query,
  onQueryChange,
  matchCount,
  matchIndex,
  onNext,
  onPrev,
  onClose,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  matchCount: number;
  matchIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, []);

  const counter =
    query.trim() && matchCount > 0
      ? `${matchIndex + 1}/${matchCount}`
      : query.trim()
        ? "0"
        : "";

  return (
    <>
      <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 items-center gap-1 rounded-xl border border-border bg-surface-2 px-2 py-1">
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) onPrev();
              else onNext();
            }
            if (e.key === "Escape") onClose();
          }}
          placeholder="Search in chat…"
          aria-label="Search in chat"
          className="min-w-0 flex-1 bg-transparent text-sm text-text placeholder:text-text-muted focus:outline-none"
        />
        {counter ? (
          <span className="shrink-0 tabular-nums text-xs text-text-muted" aria-live="polite">
            {counter}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onPrev}
        disabled={!matchCount}
        aria-label="Previous match"
        title="Previous match"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-40 sm:h-9 sm:w-9"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!matchCount}
        aria-label="Next match"
        title="Next match"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-40 sm:h-9 sm:w-9"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close search"
        title="Close search"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-text sm:h-9 sm:w-9"
      >
        <X className="h-4 w-4" />
      </button>
    </>
  );
}

/**
 * Compact custom-status chip in the chat header (Sprint C.2). Shows a small quote icon (plus a
 * short snippet on wider screens); hover or tap reveals a floating popover with the full status so
 * long text never crowds the name/presence. Closes on outside-click / Escape.
 */
function StatusChip({ status }: { status: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={ref}
      className="relative hidden sm:block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-label={`Status: ${status}`}
        className="flex max-w-[10rem] items-center gap-1.5 rounded-full border border-border bg-surface-2/70 px-2.5 py-1 text-xs text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
      >
        <Quote className="h-3 w-3 shrink-0 text-primary" />
        <span className="truncate">{status}</span>
      </button>
      {open ? (
        <div
          role="tooltip"
          className="absolute right-0 top-full z-50 mt-2 w-max max-w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface px-3 py-2 shadow-elevated"
        >
          <p className="break-words text-sm leading-snug text-text">{status}</p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Overflow (⋮) menu in the chat header (Sprint C.1): contact info, mute (soon), block/unblock,
 * unfriend, and share (soon). Closes on outside-click / Escape / action.
 */
function HeaderMenu({
  chat,
  onViewInfo,
  onOpenSearch,
}: {
  chat: ChatListItem;
  onViewInfo: () => void;
  onOpenSearch: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const block = useBlockUserMutation();
  const unblock = useUnblockUserMutation();
  const unfriend = useRemoveFriendMutation();
  const muteChat = useMuteChatMutation();
  const archiveChat = useArchiveChatMutation();
  const [reportOpen, setReportOpen] = useState(false);

  const isGroup = isGroupChat(chat);
  const isSelf = isSelfChatItem(chat);
  const participant = chat.participant;
  const friendship = participant?.friendship;
  const blocked = friendship?.status === "blocked";
  const blockedByMe = Boolean(friendship?.blockedByMe);
  const isFriend = friendship?.status === "accepted";
  const pending = block.isPending || unblock.isPending || unfriend.isPending;

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

  const run = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        title="More"
        className={cn(
          "grid h-9 w-9 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-text",
          open && "bg-surface-2 text-text",
        )}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-border bg-surface py-1 shadow-elevated"
        >
          <div className="sm:hidden">
            <HeaderMenuItem
              icon={<Search className="h-4 w-4" />}
              label="Search"
              onClick={() => run(onOpenSearch)}
            />
          </div>
          <HeaderMenuItem icon={<Info className="h-4 w-4" />} label={isGroup ? "Group info" : "Contact info"} onClick={() => run(onViewInfo)} />
          <HeaderMenuItem
            icon={chat.muted ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            label={chat.muted ? "Unmute" : "Mute notifications"}
            onClick={() => run(() => muteChat.mutate({ chatId: chat._id, muted: !chat.muted }))}
          />
          <HeaderMenuItem
            icon={chat.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            label={chat.archived ? "Unarchive" : "Archive chat"}
            onClick={() => run(() => archiveChat.mutate({ chatId: chat._id, archived: !chat.archived }))}
          />
          {/* Friend/block/share actions are meaningless for the self ("Saved messages") chat. */}
          {!isSelf && !isGroup && isFriend && participant ? (
            <HeaderMenuItem
              icon={<UserMinus className="h-4 w-4" />}
              label="Unfriend"
              disabled={pending}
              onClick={() => run(() => unfriend.mutate(participant._id))}
            />
          ) : null}
          {!isSelf && !isGroup && blocked && blockedByMe && participant ? (
            <HeaderMenuItem
              icon={<ShieldOff className="h-4 w-4" />}
              label="Unblock"
              disabled={pending}
              onClick={() => run(() => unblock.mutate(participant._id))}
            />
          ) : !isSelf && !isGroup && !blocked && participant ? (
            <HeaderMenuItem
              icon={<Ban className="h-4 w-4" />}
              label="Block"
              danger
              disabled={pending}
              onClick={() => run(() => block.mutate(participant._id))}
            />
          ) : null}
          {!isSelf && !isGroup && participant ? (
            <HeaderMenuItem
              icon={<Share2 className="h-4 w-4" />}
              label="Share contact"
              onClick={() =>
                run(() => {
                  void shareContact({ displayName: participant.displayName, username: participant.username });
                })
              }
            />
          ) : null}
          {!isSelf && !isGroup && participant ? (
            <HeaderMenuItem
              icon={<Flag className="h-4 w-4" />}
              label="Report"
              danger
              onClick={() => run(() => setReportOpen(true))}
            />
          ) : null}
        </div>
      ) : null}

      <ReportUserModal
        target={reportOpen && participant ? { userId: participant._id, name: participant.displayName } : null}
        onClose={() => setReportOpen(false)}
      />
    </div>
  );
}

function HeaderMenuItem({
  icon,
  label,
  onClick,
  disabled = false,
  danger = false,
  hint,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-surface-2 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent",
        danger ? "text-red-500" : "text-text",
      )}
    >
      <span className={cn(danger ? "text-red-500" : "text-text-muted")}>{icon}</span>
      <span className="flex-1">{label}</span>
      {hint ? <span className="text-[10px] uppercase tracking-wide text-text-muted">{hint}</span> : null}
    </button>
  );
}

function CallButton({
  label,
  icon,
  className,
  onClick,
  disabled = false,
  comingSoon = false,
}: {
  label: string;
  icon: ReactNode;
  className?: string;
  onClick?: () => void;
  /** Disabled because the action isn't possible right now (e.g. not friends / self chat). */
  disabled?: boolean;
  /** Disabled because the feature isn't built yet (e.g. video in 3.1). */
  comingSoon?: boolean;
}) {
  const isDisabled = disabled || comingSoon || !onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-label={comingSoon ? `${label} (coming soon)` : label}
      title={comingSoon ? `${label} — coming soon` : label}
      className={cn(
        // Compact on phones so name + last seen keep room; full size from sm up (Sprint G).
        "grid h-8 w-8 shrink-0 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-text-muted sm:h-9 sm:w-9",
        className,
      )}
    >
      {icon}
    </button>
  );
}

function MessageList({
  chatId,
  chat,
  isSelf = false,
  isGroup = false,
  participant,
  onReply,
  onEdit,
  onForward,
  onAtBottomChange,
  onRegisterScrollToBottom,
  searchQuery = "",
  activeMatchId = null,
}: {
  chatId: string;
  chat: ChatListItem;
  isSelf?: boolean;
  isGroup?: boolean;
  participant?: ChatListItem["participant"];
  onReply: (m: MessageDTO) => void;
  onEdit: (m: MessageDTO) => void;
  onForward: (m: MessageDTO) => void;
  onAtBottomChange?: (atBottom: boolean) => void;
  onRegisterScrollToBottom?: (fn: () => void) => void;
  searchQuery?: string;
  activeMatchId?: string | null;
}) {
  const userId = useAuthStore((s) => s.user?._id);
  const isTyping = useUIStore((s) => s.typingByChat[chatId]);
  const { data: messages = [] } = useMessages(chatId);
  const markRead = useMarkReadMutation(chatId);
  const react = useReactMessageMutation(chatId);
  const del = useDeleteMessageMutation(chatId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
    onAtBottomChange?.(true);
  }, [onAtBottomChange]);

  useEffect(() => {
    onRegisterScrollToBottom?.(() => scrollToBottom("smooth"));
  }, [onRegisterScrollToBottom, scrollToBottom]);

  // Treat "within 120px of the bottom" as at-bottom so the status strip shows for the latest messages
  // but tucks away once the user scrolls up into history.
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || !onAtBottomChange) return;
    onAtBottomChange(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
  };

  useEffect(() => {
    scrollToBottom("smooth");
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    if (isTyping) scrollToBottom("smooth");
  }, [isTyping, scrollToBottom]);

  useEffect(() => {
    if (!activeMatchId) return;
    const el = scrollRef.current?.querySelector(`[data-message-id="${activeMatchId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeMatchId]);

  useEffect(() => {
    if (!messages.length || !userId) return;
    const hasUnread = isGroup
      ? messages.some((m) => m.sender !== userId && !m.readBy.includes(userId))
      : participant
        ? messages.some((m) => m.sender === participant._id && !m.readBy.includes(userId))
        : false;
    if (hasUnread) markRead.mutate();
  }, [messages, participant?._id, userId, isGroup, markRead]);

  const grouped = messages.map((m) => ({
    ...m,
    senderKey: m.sender === userId ? "me" : isGroup ? m.sender : "them",
  }));

  let lastDay = "";

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="scroll-pane flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6"
      style={{ gap: "var(--space-bubble-gap)" }}
    >
      {grouped.map((message, index) => {
        const mine = message.senderKey === "me";
        const position = getBubblePosition(grouped, index);
        const showTimestamp = position === "last" || position === "single";
        const day = formatDayLabel(message.createdAt);
        const showDay = day !== lastDay;
        if (showDay) lastDay = day;

        if (message.type === "call") {
          return (
            <div key={message._id}>
              {showDay ? <DateSeparator label={day} /> : null}
              <CallLogRow message={message} mine={mine} />
            </div>
          );
        }

        const senderName = isGroup ? memberNameById(chat, message.sender) : (participant?.displayName ?? "Contact");

        return (
          <div key={message._id} data-message-id={message._id}>
            {showDay ? <DateSeparator label={day} /> : null}
            <MessageBubble
              message={message}
              mine={mine}
              position={position}
              showTimestamp={showTimestamp}
              userId={userId}
              participantName={senderName}
              showSenderName={isGroup && !mine && (position === "first" || position === "single")}
              searchQuery={searchQuery}
              isActiveSearchMatch={message._id === activeMatchId}
              onReply={() => onReply(message)}
              onEdit={() => onEdit(message)}
              onForward={() => onForward(message)}
              onDelete={(scope) => del.mutate({ messageId: message._id, scope })}
              onReact={(emoji) => react.mutate({ messageId: message._id, emoji })}
            />
          </div>
        );
      })}
      {!isSelf && isTyping ? <TypingRow /> : null}
      <div ref={bottomRef} className="h-px shrink-0" aria-hidden="true" />
    </div>
  );
}

function ReplyPreviewBlock({
  message,
  mine,
  participantName,
  userId,
}: {
  message: MessageDTO;
  mine: boolean;
  participantName: string;
  userId?: string;
}) {
  const r = message.replyTo;
  // Decrypt the quoted body too (Phase 2). Hook must run unconditionally, so guard the value below.
  const quoted = useDecryptedText(
    r && !r.deleted ? { id: r._id, content: r.content, encrypted: r.encrypted } : null,
  );
  if (!r) return null;
  const who = r.sender === userId ? "You" : participantName;
  const quotedText = r.deleted
    ? "Deleted message"
    : quoted.state === "pending"
      ? "Decrypting…"
      : quoted.state === "failed"
        ? "🔒 Encrypted message"
        : quoted.text;
  return (
    <div
      className={cn(
        "mb-1 rounded-lg border-l-2 px-2 py-1 text-xs",
        mine ? "border-primary-foreground/60 bg-black/10" : "border-primary/60 bg-surface-2",
      )}
    >
      <span className={cn("block font-medium", mine ? "text-primary-foreground/90" : "text-primary")}>{who}</span>
      <span className={cn("line-clamp-1 opacity-80", mine ? "text-primary-foreground" : "text-text-muted")}>
        {quotedText}
      </span>
    </div>
  );
}

function ReactionPills({
  message,
  userId,
  onReact,
}: {
  message: MessageDTO;
  userId?: string;
  onReact: (emoji: string) => void;
}) {
  if (!message.reactions?.length) return null;

  const counts = new Map<string, { count: number; mine: boolean }>();
  for (const r of message.reactions) {
    const entry = counts.get(r.emoji) ?? { count: 0, mine: false };
    entry.count += 1;
    if (r.user === userId) entry.mine = true;
    counts.set(r.emoji, entry);
  }

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {[...counts.entries()].map(([emoji, { count, mine }]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onReact(emoji)}
          className={cn(
            "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] leading-none transition-colors",
            mine ? "border-primary/40 bg-primary/10 text-text" : "border-border bg-surface text-text-muted hover:bg-surface-2",
          )}
          title={mine ? "Remove reaction" : "React"}
        >
          <span>{emoji}</span>
          {count > 1 ? <span className="tabular-nums">{count}</span> : null}
        </button>
      ))}
    </div>
  );
}

function MessageActions({
  mine,
  deleted,
  canCopy,
  canDownload,
  onReply,
  onEdit,
  onForward,
  onCopy,
  onDownload,
  onDelete,
  onReact,
}: {
  mine: boolean;
  deleted: boolean;
  /** Whether the message has copyable text (hides "Copy text" for image-only messages). */
  canCopy: boolean;
  /** Whether the message has a downloadable image (replaces "Copy text" with "Download"). */
  canDownload: boolean;
  onReply: () => void;
  onEdit: () => void;
  onForward: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onDelete: (scope: "me" | "everyone") => void;
  onReact: (emoji: string) => void;
}) {
  const [menu, setMenu] = useState<null | "react" | "more">(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menu]);

  if (deleted) return null;

  return (
    <div
      ref={ref}
      className={cn(
        "relative flex items-center gap-0.5 self-center opacity-0 transition-opacity group-hover:opacity-100",
        menu && "opacity-100",
      )}
    >
      <ActionIcon label="React" onClick={() => setMenu((m) => (m === "react" ? null : "react"))}>
        <SmilePlus className="h-4 w-4" />
      </ActionIcon>
      <ActionIcon label="Reply" onClick={onReply}>
        <CornerUpLeft className="h-4 w-4" />
      </ActionIcon>
      <ActionIcon label="More" onClick={() => setMenu((m) => (m === "more" ? null : "more"))}>
        <span className="text-base leading-none">⋯</span>
      </ActionIcon>

      {menu === "react" ? (
        <div className="absolute bottom-full right-0 z-30 mb-1 flex gap-1 rounded-full border border-border bg-surface p-1 shadow-elevated">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onReact(emoji);
                setMenu(null);
              }}
              className="grid h-8 w-8 place-items-center rounded-full text-lg transition-transform hover:scale-125"
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}

      {menu === "more" ? (
        <div className="absolute bottom-full right-0 z-30 mb-1 w-44 rounded-xl border border-border bg-surface p-1 shadow-elevated">
          {canCopy ? (
            <MenuItem icon={<Copy className="h-4 w-4" />} onClick={() => { onCopy(); setMenu(null); }}>
              Copy text
            </MenuItem>
          ) : null}
          {canDownload ? (
            <MenuItem icon={<Download className="h-4 w-4" />} onClick={() => { onDownload(); setMenu(null); }}>
              Download
            </MenuItem>
          ) : null}
          <MenuItem icon={<Forward className="h-4 w-4" />} onClick={() => { onForward(); setMenu(null); }}>
            Forward
          </MenuItem>
          {mine ? (
            <MenuItem icon={<Pencil className="h-4 w-4" />} onClick={() => { onEdit(); setMenu(null); }}>
              Edit
            </MenuItem>
          ) : null}
          <MenuItem icon={<Trash2 className="h-4 w-4" />} onClick={() => { onDelete("me"); setMenu(null); }}>
            Delete for me
          </MenuItem>
          {mine ? (
            <MenuItem
              icon={<Trash2 className="h-4 w-4" />}
              destructive
              onClick={() => { onDelete("everyone"); setMenu(null); }}
            >
              Delete for everyone
            </MenuItem>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ActionIcon({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
    >
      {children}
    </button>
  );
}

function MenuItem({
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
      onClick={onClick}
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

/** Centered system row for a call-log message (Sprint 3.1.1) — like WhatsApp's call entries. */
function CallLogRow({ message, mine }: { message: MessageDTO; mine: boolean }) {
  const call = message.call;
  if (!call) return null;

  const kind = call.media === "video" ? "Video call" : "Voice call";
  const failed = call.outcome === "missed" || call.outcome === "cancelled" || call.outcome === "declined";

  let label: string;
  let Icon = mine ? PhoneOutgoing : PhoneIncoming;
  switch (call.outcome) {
    case "completed": {
      const secs = call.durationSec ?? 0;
      const mm = Math.floor(secs / 60);
      const ss = (secs % 60).toString().padStart(2, "0");
      label = `${kind} · ${mm}:${ss}`;
      break;
    }
    case "declined":
      label = mine ? `${kind} declined` : `${kind} declined`;
      Icon = PhoneMissed;
      break;
    case "cancelled":
      // The caller cancelled before answer: a missed call for the callee, "Cancelled" for the caller.
      label = mine ? `${kind} cancelled` : `Missed ${kind.toLowerCase()}`;
      Icon = PhoneMissed;
      break;
    case "missed":
      label = mine ? "No answer" : `Missed ${kind.toLowerCase()}`;
      Icon = PhoneMissed;
      break;
    default:
      label = `${kind} failed`;
      Icon = PhoneMissed;
  }

  // Align like chat bubbles: outgoing (mine) hug the right edge, incoming/missed hug the left.
  return (
    <div className={cn("my-[var(--space-chat-gap)] flex", mine ? "justify-end" : "justify-start")}>
      <span
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs shadow-soft",
          failed ? "text-red-500" : "text-text-muted",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
        <span className="font-medium">{label}</span>
        <span className="tabular-nums opacity-70">{formatMessageTime(message.createdAt)}</span>
      </span>
    </div>
  );
}

function MessageBubble({
  message,
  mine,
  position,
  showTimestamp,
  userId,
  participantName,
  showSenderName = false,
  searchQuery = "",
  isActiveSearchMatch = false,
  onReply,
  onEdit,
  onForward,
  onDelete,
  onReact,
}: {
  message: MessageDTO & { senderKey: string };
  mine: boolean;
  position: ReturnType<typeof getBubblePosition>;
  showTimestamp: boolean;
  userId?: string;
  participantName: string;
  showSenderName?: boolean;
  searchQuery?: string;
  isActiveSearchMatch?: boolean;
  onReply: () => void;
  onEdit: () => void;
  onForward: () => void;
  onDelete: (scope: "me" | "everyone") => void;
  onReact: (emoji: string) => void;
}) {
  const groupedWithPrev = position === "middle" || position === "last";
  const deleted = message.deletedForEveryone;

  // Decrypt the body for display (Phase 2). Plaintext (bot/media caption) passes through unchanged.
  const body = useDecryptedText({ id: message._id, content: message.content, encrypted: message.encrypted });

  const handleCopy = () => {
    if (body.text) void navigator.clipboard?.writeText(body.text);
  };

  // Image-only messages get a "Download" action instead of "Copy text"; an image with a caption gets
  // both (Sprint 3.2.2).
  const isImage = message.mediaType === "image" && !!message.mediaUrl;
  const canCopy = !!body.text?.trim();
  const showSearchHighlight = Boolean(searchQuery.trim() && body.text && body.state !== "pending" && body.state !== "failed");
  const handleDownload = () => {
    void downloadMessageMedia(message).catch(() => {});
  };

  return (
    <div
      className={cn(
        "group flex animate-fade-in-up items-end gap-1.5",
        mine ? "justify-end" : "justify-start",
        groupedWithPrev ? "mt-[var(--space-bubble-gap)]" : "mt-[var(--space-chat-gap)]",
      )}
    >
      {mine ? (
        <MessageActions
          mine={mine}
          deleted={deleted}
          canCopy={canCopy}
          canDownload={isImage}
          onReply={onReply}
          onEdit={onEdit}
          onForward={onForward}
          onCopy={handleCopy}
          onDownload={handleDownload}
          onDelete={onDelete}
          onReact={onReact}
        />
      ) : null}

      <div className={cn("flex max-w-[88%] flex-col sm:max-w-[65%]", mine ? "items-end" : "items-start")}>
        {showSenderName ? (
          <p className="mb-0.5 px-1 text-[11px] font-medium text-primary">{participantName}</p>
        ) : null}
        <div
          className={cn(
            "px-4 py-2.5 text-sm leading-relaxed",
            mine
              ? cn("bg-gradient-primary text-primary-foreground shadow-soft", bubbleRadiusClasses(position, true))
              : cn("border border-border bg-surface text-text shadow-soft", bubbleRadiusClasses(position, false)),
            isActiveSearchMatch && "ring-2 ring-primary ring-offset-2 ring-offset-bg",
          )}
        >
          {!deleted && message.forwarded ? (
            <span
              className={cn(
                "mb-0.5 flex items-center gap-1 text-[11px] italic",
                mine ? "text-primary-foreground/70" : "text-text-muted",
              )}
            >
              <Forward className="h-3 w-3" />
              Forwarded
            </span>
          ) : null}
          {!deleted ? (
            <ReplyPreviewBlock message={message} mine={mine} participantName={participantName} userId={userId} />
          ) : null}
          {deleted ? (
            <span className="italic opacity-70">This message was deleted</span>
          ) : (
            <>
              {message.mediaUrl ? (
                <div className={cn(message.content && "mb-1.5")}>
                  <MessageMedia message={message} mine={mine} />
                </div>
              ) : null}
              {message.content ? (
                body.state === "pending" ? (
                  <span className="italic opacity-60">Decrypting…</span>
                ) : body.state === "failed" ? (
                  <span className="italic opacity-60">🔒 Can’t decrypt on this device</span>
                ) : showSearchHighlight ? (
                  <span className="whitespace-pre-wrap break-words">
                    {highlightText(body.text, searchQuery, isActiveSearchMatch)}
                  </span>
                ) : (
                  <span className="whitespace-pre-wrap break-words">{body.text}</span>
                )
              ) : null}
            </>
          )}
          {message.editedAt && !deleted ? (
            <span className={cn("ml-2 align-baseline text-[10px]", mine ? "text-primary-foreground/70" : "text-text-muted")}>
              (edited)
            </span>
          ) : null}
        </div>

        <ReactionPills message={message} userId={userId} onReact={onReact} />

        {showTimestamp ? (
          <div
            className={cn(
              "mt-1 flex items-center gap-1 px-1 text-[10px] text-text-muted",
              mine ? "flex-row-reverse" : "flex-row",
            )}
          >
            <span className="tabular-nums">{formatMessageTime(message.createdAt)}</span>
            {mine ? <ReadReceipt status={message.status} /> : null}
          </div>
        ) : null}
      </div>

      {!mine ? (
        <MessageActions
          mine={mine}
          deleted={deleted}
          canCopy={canCopy}
          canDownload={isImage}
          onReply={onReply}
          onEdit={onEdit}
          onForward={onForward}
          onCopy={handleCopy}
          onDownload={handleDownload}
          onDelete={onDelete}
          onReact={onReact}
        />
      ) : null}
    </div>
  );
}

function ReadReceipt({ status }: { status: MessageDTO["status"] }) {
  // "Seen" uses the familiar blue tick regardless of the active accent theme.
  if (status === "read") {
    return <CheckCheck className="h-3 w-3 text-sky-500" aria-label="Read" />;
  }
  if (status === "delivered") {
    return <CheckCheck className="h-3 w-3 text-text-muted" aria-label="Delivered" />;
  }
  return <Check className="h-3 w-3 text-text-muted" aria-label="Sent" />;
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-2">
      <span className="rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-medium text-text-muted shadow-soft">
        {label}
      </span>
    </div>
  );
}

/**
 * Inline notice shown in place of the composer when the participant isn't an accepted friend
 * (stranger / pending / blocked). Offers the matching action so messaging can be unlocked in place.
 */
function ComposerGate({
  participantId,
  participantName,
  friendship,
}: {
  participantId: string;
  participantName: string;
  friendship?: ChatParticipantFriendship;
}) {
  const send = useSendFriendRequestMutation();
  const accept = useAcceptFriendRequestMutation();
  const cancel = useCancelFriendRequestMutation();
  const pending = send.isPending || accept.isPending || cancel.isPending;
  const friendshipId = friendship?.friendshipId;
  const [requestsDisabledOpen, setRequestsDisabledOpen] = useState(false);

  const sendRequest = () => {
    send.mutate(participantId, {
      onError: (err) => {
        if (getApiErrorCode(err) === "REQUESTS_DISABLED") setRequestsDisabledOpen(true);
      },
    });
  };

  let message: string;
  let action: ReactNode = null;

  if (friendship?.status === "blocked") {
    message = friendship.blockedByMe
      ? `You blocked ${participantName}. Unblock from the details panel to message again.`
      : "You can't message this conversation right now.";
  } else if (friendship?.status === "pending" && friendship.direction === "outgoing") {
    message = `Friend request sent. You can message once ${participantName} accepts.`;
    action = friendshipId ? (
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => cancel.mutate(friendshipId)}>
        Cancel request
      </Button>
    ) : null;
  } else if (friendship?.status === "pending" && friendship.direction === "incoming") {
    message = `${participantName} sent you a friend request.`;
    action = friendshipId ? (
      <Button variant="gradient" size="sm" disabled={pending} onClick={() => accept.mutate(friendshipId)}>
        <Check className="h-4 w-4" />
        Accept
      </Button>
    ) : null;
  } else {
    // Strangers (no friendship, or a stale rejected row) → send a request to start messaging.
    message = `You're not friends with ${participantName}. Add friend to start messaging.`;
    action = (
      <Button variant="gradient" size="sm" disabled={pending} onClick={sendRequest}>
        <UserPlus className="h-4 w-4" />
        Add friend
      </Button>
    );
  }

  return (
    <>
      <div
        className="flex shrink-0 flex-col items-center gap-2 border-t border-border bg-surface/80 p-4 text-center backdrop-blur-sm"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <p className="text-sm text-text-muted">{message}</p>
        {action}
      </div>
      <FriendRequestDisabledModal
        name={participantName}
        open={requestsDisabledOpen}
        onClose={() => setRequestsDisabledOpen(false)}
      />
    </>
  );
}

function Composer({
  chatId,
  participantId,
  participantName,
  friendship,
  isSelf = false,
  isGroup = false,
  target,
  onClearTarget,
  scrollToBottom,
}: {
  chatId: string;
  participantId: string;
  participantName: string;
  friendship?: ChatParticipantFriendship;
  isSelf?: boolean;
  isGroup?: boolean;
  target: ComposerTarget;
  onClearTarget: () => void;
  /** Scroll the message list when the input is focused (mobile keyboard — WhatsApp-style). */
  scrollToBottom?: () => void;
}) {
  const [text, setText] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // A picked-but-not-yet-sent attachment + its preview object URL (images only; revoked on clear/unmount).
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedPreviewUrl, setStagedPreviewUrl] = useState<string | null>(null);
  const send = useSendMessageMutation(chatId);
  const edit = useEditMessageMutation(chatId);
  const upload = useUploadMediaMutation(chatId);
  const userId = useAuthStore((s) => s.user?._id);
  // Drive the emoji picker's light/dark skin from the ACTUAL applied theme mode (the legacy
  // themeStore.colorMode is unused and always "light", which is why the picker looked light).
  const { mode } = useTheme();
  // Mobile (WhatsApp-style): the picker docks below the composer field instead of floating above.
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  const dockedEmojiRef = useRef<HTMLDivElement>(null);
  const typingRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  const stopTyping = () => {
    if (typingRef.current) {
      window.clearTimeout(typingRef.current);
      typingRef.current = null;
    }
    emitTypingStop(chatId);
  };

  // Stop typing when leaving the chat or unmounting so the peer never sees a stale indicator.
  useEffect(() => () => stopTyping(), [chatId]);

  /** WhatsApp-style: keep the latest messages visible when the mobile keyboard opens. */
  const bumpScrollForKeyboard = useCallback(() => {
    scrollToBottom?.();
    requestAnimationFrame(() => scrollToBottom?.());
    window.setTimeout(() => scrollToBottom?.(), 120);
    window.setTimeout(() => scrollToBottom?.(), 320);
  }, [scrollToBottom]);

  useEffect(() => {
    if (!isMobile || !scrollToBottom) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const onViewportChange = () => {
      if (document.activeElement === inputRef.current) bumpScrollForKeyboard();
    };
    vv.addEventListener("resize", onViewportChange);
    vv.addEventListener("scroll", onViewportChange);
    return () => {
      vv.removeEventListener("resize", onViewportChange);
      vv.removeEventListener("scroll", onViewportChange);
    };
  }, [isMobile, bumpScrollForKeyboard]);

  const isEditing = Boolean(target.editing);

  // Outside-click / Escape closes the emoji popover. The toggle (+ desktop floating popover) lives in
  // `emojiRef`; the mobile docked panel lives in `dockedEmojiRef`, so a tap is "inside" if it hits
  // either — otherwise the docked panel would close itself the moment you tapped an emoji.
  useEffect(() => {
    if (!emojiOpen) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const inToggle = emojiRef.current?.contains(target);
      const inDocked = dockedEmojiRef.current?.contains(target);
      if (!inToggle && !inDocked) setEmojiOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEmojiOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [emojiOpen]);

  // Toggle the in-app emoji picker. Opening it blurs the textarea so the device's NATIVE keyboard
  // (which has its own emoji pane) collapses first — otherwise mobile shows two emoji panels at once.
  // Focusing the textarea again (see onFocus below) closes this picker, so only one is ever open.
  const toggleEmoji = () => {
    setEmojiOpen((open) => {
      const next = !open;
      if (next) inputRef.current?.blur();
      return next;
    });
  };

  // Insert an emoji at the caret (falls back to append) and keep the textarea focused.
  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    if (!el) {
      setText((t) => t + emoji);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    setText(text.slice(0, start) + emoji + text.slice(end));
    const pos = start + emoji.length;
    requestAnimationFrame(() => {
      el.setSelectionRange(pos, pos);
      // Only steal focus on a fine pointer (desktop). On touch devices, focusing the textarea
      // reopens the native keyboard on top of the in-app picker — the very "two packs" bug. Touch
      // users tap the field directly (which closes the picker via outside-click) when ready to type.
      if (!window.matchMedia("(pointer: coarse)").matches) el.focus();
    });
  };

  // Reject oversized files up front (server enforces this too); returns true when within the cap.
  const withinSizeLimit = (file: File): boolean => {
    const cap = file.type.startsWith("image/") ? MEDIA_IMAGE_MAX_BYTES : MEDIA_FILE_MAX_BYTES;
    if (file.size > cap) {
      setUploadError(`File is too large (max ${Math.round(cap / (1024 * 1024))} MB).`);
      return false;
    }
    return true;
  };

  // Discard the staged attachment and free its preview object URL.
  const clearStaged = () => {
    setStagedPreviewUrl((url) => {
      if (url) URL.revokeObjectURL(url);
      return null;
    });
    setStagedFile(null);
  };

  // Picking a file no longer auto-sends — it stages the file (with an image preview) so the user can
  // add a caption and review before hitting Send.
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;

    setUploadError(null);
    if (!withinSizeLimit(file)) return;

    clearStaged();
    setStagedFile(file);
    if (file.type.startsWith("image/")) {
      setStagedPreviewUrl(URL.createObjectURL(file));
    }
  };

  // Safety net: revoke any outstanding preview URL when the composer unmounts.
  useEffect(() => {
    return () => {
      setStagedPreviewUrl((url) => {
        if (url) URL.revokeObjectURL(url);
        return null;
      });
    };
  }, []);

  // Don't carry a staged attachment across chats — drop it (and its preview) when the chat changes.
  useEffect(() => {
    clearStaged();
    setUploadError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // Decrypt the editing/replying bodies for the composer banner + edit prefill (Phase 2).
  const editingText = useDecryptedText(
    target.editing
      ? { id: target.editing._id, content: target.editing.content, encrypted: target.editing.encrypted }
      : null,
  );
  const replyText = useDecryptedText(
    target.replyTo
      ? { id: target.replyTo._id, content: target.replyTo.content, encrypted: target.replyTo.encrypted }
      : null,
  );

  // When entering edit mode, prefill the composer with the existing (decrypted) body.
  useEffect(() => {
    if (target.editing && (editingText.state === "plain" || editingText.state === "decrypted")) {
      setText(editingText.text);
      inputRef.current?.focus();
    }
  }, [target.editing, editingText.state, editingText.text]);

  useEffect(() => {
    if (target.replyTo) inputRef.current?.focus();
  }, [target.replyTo]);

  // Messaging is gated server-side by friendship (NOT_FRIENDS / blocked). Rather than render an input
  // that would just fail on send, show a friendly inline notice with the right action (Sprint 5.7).
  // Self ("Saved messages") chats have no peer, so they're never gated (Sprint C.2).
  if (!isSelf && !isGroup && friendship?.status !== "accepted") {
    return (
      <ComposerGate
        participantId={participantId}
        participantName={participantName}
        friendship={friendship}
      />
    );
  }

  const busy = send.isPending || edit.isPending || upload.isPending;
  // A staged attachment can be sent on its own (caption optional); otherwise we need some text.
  const canSend = (stagedFile !== null || text.trim().length > 0) && !busy;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    stopTyping();
    const content = text.trim();

    // A staged file always sends as a media message (the text becomes its caption). Editing never
    // has a staged file because attachment staging is disabled in edit mode.
    if (stagedFile && !target.editing) {
      if (!withinSizeLimit(stagedFile)) return;
      setUploadError(null);
      upload.mutate(
        { file: stagedFile, caption: content || undefined },
        {
          onSuccess: () => {
            clearStaged();
            setText("");
          },
          onError: (error) => setUploadError(uploadErrorMessage(error)),
        },
      );
      return;
    }

    if (!content) return;

    if (target.editing) {
      const messageId = target.editing._id;
      // Clear the field immediately so it feels instant; the cache is patched on success. Restore
      // the text only if the edit actually fails (and the user hasn't started typing something new).
      setText("");
      onClearTarget();
      edit.mutate(
        { messageId, content },
        { onError: () => setText((t) => (t.length > 0 ? t : content)) },
      );
      return;
    }

    // Clear the composer right away — the optimistic bubble already renders via the mutation's
    // onMutate, so there's no reason to keep the text until the server ack (which includes the E2EE
    // encryption + socket round-trip and was causing a visible ~2s lag). Restore on failure only.
    const replyTo = target.replyTo?._id;
    setText("");
    onClearTarget();
    send.mutate(
      { content, replyTo },
      { onError: () => setText((t) => (t.length > 0 ? t : content)) },
    );
  };

  const handleChange = (value: string) => {
    setText(value);
    if (typingRef.current) window.clearTimeout(typingRef.current);
    if (!value.trim()) {
      stopTyping();
      return;
    }
    emitTyping(chatId);
    // Idle stop — peer sees typing only while keys are moving; cleared instantly on send.
    typingRef.current = window.setTimeout(() => {
      typingRef.current = null;
      emitTypingStop(chatId);
    }, 1500);
  };

  const replyWho = target.replyTo ? (target.replyTo.sender === userId ? "yourself" : participantName) : "";

  return (
    <form
      onSubmit={handleSubmit}
      className="shrink-0 border-t border-border bg-surface/80 px-1.5 py-2 backdrop-blur-sm sm:px-4 sm:py-3"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      {target.replyTo || target.editing ? (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
          {isEditing ? (
            <Pencil className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <CornerUpLeft className="h-4 w-4 shrink-0 text-primary" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-primary">
              {isEditing ? "Editing message" : `Replying to ${replyWho}`}
            </p>
            <p className="truncate text-xs text-text-muted">
              {isEditing ? editingText.text : replyText.text}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onClearTarget();
              if (isEditing) setText("");
            }}
            aria-label="Cancel"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {uploadError ? (
        <p className="mb-2 px-1 text-xs text-red-500" role="alert">
          {uploadError}
        </p>
      ) : null}

      {stagedFile ? (
        <div className="mb-2 flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2">
          {stagedPreviewUrl ? (
            <img
              src={stagedPreviewUrl}
              alt={stagedFile.name}
              className="h-14 w-14 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-surface text-text-muted">
              <FileText className="h-6 w-6" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text">{stagedFile.name}</p>
            <p className="text-xs text-text-muted">
              {upload.isPending ? "Uploading…" : formatFileSize(stagedFile.size)}
            </p>
          </div>
          <button
            type="button"
            onClick={clearStaged}
            disabled={upload.isPending}
            aria-label="Remove attachment"
            title="Remove attachment"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface hover:text-text disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <div className="composer-field mx-auto flex w-[90%] max-w-full items-end gap-0 rounded-2xl border border-border bg-surface-2 px-0.5 py-1 shadow-soft sm:w-full sm:gap-1.5 sm:px-2 sm:py-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept={MEDIA_ACCEPT}
          className="hidden"
          onChange={handleFileChange}
          aria-hidden="true"
          tabIndex={-1}
        />
        <button
          type="button"
          aria-label="Attach file"
          title={upload.isPending ? "Uploading…" : "Attach a photo or file"}
          disabled={upload.isPending || isEditing}
          onClick={() => fileInputRef.current?.click()}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface hover:text-text disabled:opacity-50 sm:h-9 sm:w-9"
        >
          {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
        </button>
        <div ref={emojiRef} className="relative shrink-0 -ml-1">
          <button
            type="button"
            aria-label="Insert emoji"
            title="Emoji"
            aria-expanded={emojiOpen}
            onClick={() => toggleEmoji()}
            className={cn(
              "grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-surface hover:text-text sm:h-9 sm:w-9",
              emojiOpen ? "text-primary" : "text-text-muted",
            )}
          >
            <Smile className="h-4 w-4" />
          </button>
          {emojiOpen && !isMobile ? (
            <EmojiPickerPopover onSelect={insertEmoji} theme={mode} />
          ) : null}
        </div>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={bumpScrollForKeyboard}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
            if (e.key === "Escape" && (target.replyTo || target.editing)) {
              onClearTarget();
              if (isEditing) setText("");
            }
          }}
          placeholder={isEditing ? "Edit your message..." : stagedFile ? "Add a caption…" : "Type a message..."}
          rows={1}
          aria-label="Message input"
          className="composer-input min-h-8 min-w-0 flex-1 resize-none bg-transparent px-0 py-0 text-sm leading-8 text-text placeholder:text-text-muted focus:outline-none sm:min-h-[2.25rem] sm:px-1 sm:py-2 sm:leading-normal"
        />
        <Button
          type="submit"
          variant="gradient"
          size="icon"
          disabled={!canSend}
          aria-label={isEditing ? "Save edit" : "Send message"}
          className="h-8 w-8 shrink-0 sm:h-9 sm:w-9"
        >
          {isEditing ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>

      {/* Mobile: the picker docks here, below the field — the text box stays above it (WhatsApp-style).
          The bottom-anchored composer grows upward, so the message list shrinks instead of being covered. */}
      {emojiOpen && isMobile ? (
        <div ref={dockedEmojiRef} className="mt-2">
          <EmojiPickerPopover docked onSelect={insertEmoji} theme={mode} />
        </div>
      ) : null}
    </form>
  );
}

function EmptyState() {
  const openFriendSearch = useUIStore((s) => s.openFriendSearch);

  return (
    <section className="flex h-full flex-1 flex-col items-center justify-center bg-bg px-6 text-center">
      <div className="empty-state-art relative grid h-28 w-28 place-items-center">
        <div className="empty-bubble empty-bubble-1" aria-hidden="true" />
        <div className="empty-bubble empty-bubble-2" aria-hidden="true" />
        <div className="empty-lock grid h-16 w-16 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow">
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
      </div>
      <h2 className="mt-8 text-xl font-semibold tracking-tight">Select a conversation</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-text-muted">
        Pick a chat from the left, or start a new one.
      </p>
      <Button variant="outline" className="mt-6" onClick={openFriendSearch}>
        Start a new chat
      </Button>
      <EncryptedBadge className="mt-5" />
    </section>
  );
}
