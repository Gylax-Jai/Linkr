import { useEffect, useState, type ReactNode } from "react";
import {
  Archive,
  ArchiveRestore,
  Ban,
  Bell,
  NotepadText,
  Check,
  Clock,
  Image,
  Info,
  Share2,
  ShieldCheck,
  ShieldOff,
  UserPlus,
  VolumeX,
  X,
} from "lucide-react";
import type { ChatParticipantFriendship, MessageDTO } from "@linkr/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/button";
import { EncryptedBadge } from "@/components/ui/EncryptedBadge";
import {
  useAcceptFriendRequestMutation,
  useBlockUserMutation,
  useCancelFriendRequestMutation,
  useRejectFriendRequestMutation,
  useSendFriendRequestMutation,
  useUnblockUserMutation,
} from "@/features/friends";
import { MessageMedia, useArchiveChatMutation, useChatById, useMessages, useMuteChatMutation } from "@/features/chat";
import { useAuthedObjectUrl } from "@/lib/hooks/useAuthedObjectUrl";
import { useAuthStore, useUIStore } from "@/lib/store";
import { shareContact } from "@/lib/utils/share";
import { canShowContactCard, canShowDisplayName, canShowProfileDetails, canZoomAvatar, getPresenceLabel, showOnlineDot } from "@/lib/utils/privacy";
import { cn } from "@/lib/utils";

type TabId = "profile" | "media" | "files";

/** Right pane: tabbed contact details (Profile | Media | Files), desktop only. */
export function DetailsPane() {
  return (
    <aside className="hidden h-full w-80 shrink-0 overflow-hidden border-l border-border bg-surface lg:block">
      <DetailsContent />
    </aside>
  );
}

/**
 * Mobile-only slide-up sheet presenting the same details content. Gated on `mobileDetailsOpen`
 * (an explicit user action) AND an active chat so it never pops open by default. Dismiss via the
 * backdrop, the ✕ button, or Escape. The sheet body scrolls internally (Sprint 5.5 page-scroll lock).
 */
export function MobileDetailsSheet() {
  const mobileDetailsOpen = useUIStore((s) => s.mobileDetailsOpen);
  const activeChatId = useUIStore((s) => s.activeChatId);
  const closeMobileDetails = useUIStore((s) => s.closeMobileDetails);
  const open = mobileDetailsOpen && Boolean(activeChatId);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMobileDetails();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeMobileDetails]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Contact info">
      <button
        type="button"
        onClick={closeMobileDetails}
        aria-label="Close contact info"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      {/* Phones: bottom slide-up sheet. Tablet/medium widths (sm–lg): a right-side drawer so the
          contact "side profile" reads the same as the desktop pane (Sprint C.2). */}
      <div className="absolute inset-x-0 bottom-0 top-12 flex animate-fade-in-up flex-col overflow-hidden rounded-t-2xl border-t border-border bg-surface shadow-elevated sm:inset-y-0 sm:left-auto sm:right-0 sm:top-0 sm:w-96 sm:rounded-t-none sm:border-l sm:border-t-0">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold tracking-tight">Contact info</span>
          <button
            type="button"
            onClick={closeMobileDetails}
            aria-label="Close contact info"
            className="grid h-9 w-9 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <DetailsContent />
        </div>
      </div>
    </div>
  );
}

/** Shared presentational body used by both the desktop aside and the mobile sheet. */
function DetailsContent() {
  const activeChatId = useUIStore((s) => s.activeChatId);
  const sessionUser = useAuthStore((s) => s.user);
  const onlineOverrides = useUIStore((s) => s.onlineOverrides);
  const chat = useChatById(activeChatId);
  const [tab, setTab] = useState<TabId>("profile");

  const participant = chat?.participant;
  // Self chat: own space, no presence/relationship/block actions (Sprint C.2).
  const isSelf = chat?.type === "self";
  const showProfileDetails = participant ? canShowProfileDetails(participant) : true;
  const showDisplayName = participant ? canShowDisplayName(participant) : true;
  const showAvatar = participant ? canShowContactCard(participant) : true;
  const avatarZoomable = participant ? canZoomAvatar(participant) : true;
  const headerName = isSelf ? "Self chat" : showDisplayName ? participant?.displayName : "Linkr user";
  const displayName = headerName;
  const online = !isSelf && participant ? (onlineOverrides[participant._id] ?? participant.online) : false;
  const presenceLabel = participant && !isSelf ? getPresenceLabel(participant, online) : null;
  const showDot = participant && !isSelf ? showOnlineDot(participant, online) : false;

  const block = useBlockUserMutation();
  const unblock = useUnblockUserMutation();
  const muteChat = useMuteChatMutation();
  const archiveChat = useArchiveChatMutation();
  const [shareNote, setShareNote] = useState<string | null>(null);
  const blocked = participant?.friendship?.status === "blocked";
  const blockedByMe = Boolean(participant?.friendship?.blockedByMe);
  const blockPending = block.isPending || unblock.isPending;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-col items-center gap-3 border-b border-border px-6 py-8 text-center">
        <Avatar
          name={isSelf ? (sessionUser?.displayName ?? "You") : (headerName ?? "Linkr")}
          src={showAvatar ? participant?.avatar : undefined}
          size="xl"
          ring
          online={showDot}
          pulseRing={showDot}
          zoomable={avatarZoomable}
          icon={isSelf ? <NotepadText className="h-7 w-7" /> : undefined}
        />
        <div className="space-y-1">
          <p className="text-lg font-semibold tracking-tight">{displayName ?? "Select a chat"}</p>
          <p className="font-mono text-xs text-text-muted">
            {isSelf ? "Only you" : participant?.username ? `@${participant.username}` : "—"}
          </p>
          {/* Presence under the name (Sprint F): on phones this replaces the "Private chat" badge
              (which is hidden < sm) so the contact's last seen is visible where it matters most. */}
          {!isSelf && participant && presenceLabel ? (
            <p className="text-xs font-medium text-text-muted">
              {presenceLabel === "Online" ? (
                <span className="text-online">Online</span>
              ) : (
                presenceLabel
              )}
            </p>
          ) : null}
        </div>
        <EncryptedBadge className="mt-1 hidden sm:inline-flex" />
      </div>

      <div className="flex border-b border-border px-2">
        {(["profile", "media", "files"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex-1 px-3 py-2.5 text-xs font-semibold capitalize transition-colors",
              tab === id ? "border-b-2 border-primary text-text" : "text-text-muted hover:text-text",
            )}
          >
            {id}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {tab === "profile" ? (
          <div className="space-y-4">
            <DetailSection icon={<Info className="h-4 w-4" />} label="About">
              {isSelf
                ? "Your personal space — jot notes, save links, and message yourself. Messages here are just for you."
                : participant
                  ? showProfileDetails
                    ? participant.bio?.trim()
                      ? participant.bio
                      : `You're connected with ${participant.displayName}. Only friends can message and call on Linkr.`
                    : showAvatar
                      ? `${participant.displayName} keeps their bio private. Add them as a friend to see more.`
                      : "This user has hidden their profile."
                  : (sessionUser?.bio ?? "Select a conversation to view contact details.")}
            </DetailSection>

            <DetailSection icon={<ShieldCheck className="h-4 w-4" />} label="Privacy">
              Strangers can find you, but only friends can message or call.
              {sessionUser?.username ? (
                <span className="mt-1 block font-mono text-xs text-text-muted">You are @{sessionUser.username}</span>
              ) : null}
            </DetailSection>
          </div>
        ) : null}

        {tab === "media" ? <MediaTab chatId={activeChatId} /> : null}

        {tab === "files" ? <FilesTab chatId={activeChatId} /> : null}
      </div>

      {participant && !isSelf ? (
        <RelationshipControl participantId={participant._id} friendship={participant.friendship} />
      ) : null}

      <div className="shrink-0 space-y-2 border-t border-border p-4">
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!chat}
            className="flex-1"
            title={chat?.muted ? "Unmute notifications" : "Mute notifications"}
            onClick={() => chat && muteChat.mutate({ chatId: chat._id, muted: !chat.muted })}
          >
            {chat?.muted ? <Bell className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            {chat?.muted ? "Unmute" : "Mute"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={!chat}
            className="flex-1"
            title={chat?.archived ? "Unarchive chat" : "Archive chat"}
            onClick={() => chat && archiveChat.mutate({ chatId: chat._id, archived: !chat.archived })}
          >
            {chat?.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {chat?.archived ? "Unarchive" : "Archive"}
          </Button>
        </div>
        <div className="flex gap-2">
          {isSelf ? null : blocked && !blockedByMe ? (
            // A block placed by the other user can't be lifted here.
            <Button variant="ghost" size="sm" disabled className="flex-1" title="This user has blocked you">
              <Ban className="h-4 w-4" />
              Blocked
            </Button>
          ) : blocked && blockedByMe ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={!participant || blockPending}
              className="flex-1"
              onClick={() => participant && unblock.mutate(participant._id)}
            >
              <ShieldOff className="h-4 w-4" />
              Unblock
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={!participant || blockPending}
              className="flex-1"
              onClick={() => participant && block.mutate(participant._id)}
            >
              <Ban className="h-4 w-4" />
              Block
            </Button>
          )}
          {isSelf ? null : (
            <Button
              variant="ghost"
              size="sm"
              disabled={!participant}
              className="flex-1"
              title="Share this contact"
              onClick={async () => {
                if (!participant) return;
                const result = await shareContact({
                  displayName: participant.displayName,
                  username: participant.username,
                });
                if (result === "copied") setShareNote("Copied to clipboard");
                else if (result === "shared") setShareNote("Shared");
                else if (result === "unavailable") setShareNote("Couldn't share");
                if (result !== "cancelled") {
                  window.setTimeout(() => setShareNote(null), 2000);
                }
              }}
            >
              <Share2 className="h-4 w-4" />
              {shareNote ?? "Share"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Re-friend control for the active participant so the user can add/accept/cancel without leaving the
 * chat (Sprint 5.7). Friends and blocked relationships render nothing here (Block lives in the footer).
 */
function RelationshipControl({
  participantId,
  friendship,
}: {
  participantId: string;
  friendship?: ChatParticipantFriendship;
}) {
  const send = useSendFriendRequestMutation();
  const accept = useAcceptFriendRequestMutation();
  const reject = useRejectFriendRequestMutation();
  const cancel = useCancelFriendRequestMutation();
  const pending = send.isPending || accept.isPending || reject.isPending || cancel.isPending;

  // Friends and blocked states are handled elsewhere (footer Block/Unblock); nothing to add here.
  if (friendship?.status === "accepted" || friendship?.status === "blocked") return null;

  const isPending = friendship?.status === "pending";
  const friendshipId = friendship?.friendshipId;

  let body: ReactNode;
  if (isPending && friendship?.direction === "outgoing") {
    body = (
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-text-muted">
          <Clock className="h-3.5 w-3.5" />
          Friend request sent
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending || !friendshipId}
          onClick={() => friendshipId && cancel.mutate(friendshipId)}
        >
          Cancel
        </Button>
      </div>
    );
  } else if (isPending && friendship?.direction === "incoming") {
    body = (
      <div className="flex items-center gap-2">
        <Button
          variant="gradient"
          size="sm"
          className="flex-1"
          disabled={pending || !friendshipId}
          onClick={() => friendshipId && accept.mutate(friendshipId)}
        >
          <Check className="h-4 w-4" />
          Accept
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending || !friendshipId}
          onClick={() => friendshipId && reject.mutate(friendshipId)}
          aria-label="Reject friend request"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  } else {
    // Strangers (no friendship, or a stale rejected row) → send a request.
    body = (
      <Button
        variant="gradient"
        size="sm"
        className="w-full"
        disabled={pending}
        onClick={() => send.mutate(participantId)}
      >
        <UserPlus className="h-4 w-4" />
        Add friend
      </Button>
    );
  }

  return <div className="shrink-0 border-t border-border px-4 pt-4">{body}</div>;
}

/** Shared images in the active chat as a thumbnail grid (newest first), derived from the cache. */
function MediaTab({ chatId }: { chatId: string | null }) {
  const { data: messages = [] } = useMessages(chatId);
  const images = [...messages]
    .reverse()
    .filter((m) => m.type === "image" && m.mediaUrl && !m.deletedForEveryone);

  if (images.length === 0) {
    return (
      <EmptyTab
        icon={<Image className="h-8 w-8" />}
        label="No media yet"
        hint="Photos shared in this chat will appear here."
      />
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {images.map((m) => (
        <MediaThumb key={m._id} message={m} />
      ))}
    </div>
  );
}

function MediaThumb({ message }: { message: MessageDTO }) {
  const { src, loading, error } = useAuthedObjectUrl(message.mediaUrl);

  if (error) {
    return <div className="aspect-square rounded-lg bg-surface-2" aria-hidden="true" />;
  }
  if (!src || loading) {
    return <div className="aspect-square animate-pulse rounded-lg bg-surface-2" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={() => window.open(src, "_blank", "noopener,noreferrer")}
      className="aspect-square overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={message.mediaName ?? "Open image"}
    >
      <img
        src={src}
        alt={message.mediaName ?? "Shared image"}
        className="h-full w-full object-cover transition-transform hover:scale-105"
        loading="lazy"
      />
    </button>
  );
}

/** Shared files in the active chat as a download list (newest first), reusing the chat file chip. */
function FilesTab({ chatId }: { chatId: string | null }) {
  const { data: messages = [] } = useMessages(chatId);
  const files = [...messages]
    .reverse()
    .filter((m) => m.type === "file" && m.mediaUrl && !m.deletedForEveryone);

  if (files.length === 0) {
    return (
      <EmptyTab
        icon={<Share2 className="h-8 w-8" />}
        label="No files yet"
        hint="Documents shared in this chat will appear here."
      />
    );
  }

  return (
    <div className="space-y-2">
      {files.map((m) => (
        <MessageMedia key={m._id} message={m} mine={false} />
      ))}
    </div>
  );
}

function EmptyTab({ icon, label, hint }: { icon: ReactNode; label: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <span className="text-text-muted/40">{icon}</span>
      <p className="mt-3 text-sm font-medium text-text">{label}</p>
      <p className="mt-1 max-w-[200px] text-xs text-text-muted">{hint}</p>
    </div>
  );
}

function DetailSection({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface-2/50 p-4 shadow-soft">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
        <span className="text-primary">{icon}</span>
        {label}
      </p>
      <div className="mt-2 text-sm leading-relaxed text-text">{children}</div>
    </div>
  );
}
