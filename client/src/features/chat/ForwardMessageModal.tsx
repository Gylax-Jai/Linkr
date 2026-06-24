import { useEffect, useMemo, useState } from "react";
import { Bookmark, Loader2, Search, Send, X } from "lucide-react";
import type { MessageDTO } from "@linkr/shared";
import { Avatar } from "@/components/ui/Avatar";
import { useFriends } from "@/features/friends";
import { useAuthStore } from "@/lib/store";
import { useDecryptedText } from "@/lib/crypto";
import { cn } from "@/lib/utils";
import { useForwardMessageMutation } from "./useMessages";

/** Short, human label describing what is being forwarded (used in the modal header preview). */
function ForwardPreview({ message }: { message: MessageDTO }) {
  const body = useDecryptedText(
    message.content ? { id: message._id, content: message.content, encrypted: message.encrypted } : null,
  );
  if (message.mediaType === "image" || (message.mediaUrl && message.type === "image")) return <>📷 Photo</>;
  if (message.mediaUrl) return <>📎 {message.mediaName ?? "File"}</>;
  if (message.content) {
    if (body.state === "pending") return <>Decrypting…</>;
    if (body.state === "failed") return <>🔒 Encrypted message</>;
    return <>{body.text}</>;
  }
  return <>Message</>;
}

/**
 * Forward a message to a friend (Phase 4). Friends-only: the list is the user's accepted friends
 * plus their own "Saved messages". Picking a target forwards immediately (text is re-encrypted for
 * that peer; media is copied server-side) and closes. Bottom sheet on mobile, centered on desktop.
 */
export function ForwardMessageModal({ message, onClose }: { message: MessageDTO | null; onClose: () => void }) {
  const sessionUser = useAuthStore((s) => s.user);
  const { data, isLoading } = useFriends();
  const forward = useForwardMessageMutation();
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [message, onClose]);

  // Reset transient state whenever the modal closes/opens for a different message.
  useEffect(() => {
    if (!message) {
      setQuery("");
      setPendingId(null);
    }
  }, [message]);

  const friends = useMemo(() => {
    const accepted = (data?.friends ?? []).filter((f) => f.status === "accepted");
    const q = query.trim().toLowerCase();
    if (!q) return accepted;
    return accepted.filter(
      (f) =>
        f.user.displayName.toLowerCase().includes(q) || f.user.username?.toLowerCase().includes(q),
    );
  }, [data, query]);

  if (!message) return null;

  const send = async (targetUserId: string, rowId: string) => {
    if (forward.isPending) return;
    setPendingId(rowId);
    try {
      await forward.mutateAsync({ message, targetUserId });
      onClose();
    } finally {
      setPendingId(null);
    }
  };

  const showSelf = sessionUser && (!query.trim() || "saved messages".includes(query.trim().toLowerCase()));

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-bg/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative z-10 flex max-h-[80vh] w-full max-w-md flex-col rounded-t-3xl border border-border bg-surface shadow-elevated sm:rounded-3xl",
          "animate-fade-in-up",
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border p-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text">Forward to…</h2>
            <p className="mt-0.5 truncate text-xs text-text-muted">
              <ForwardPreview message={message} />
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close forward"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-text-muted hover:bg-surface-2 hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-3">
          <div className="group flex items-center gap-2 rounded-2xl border border-transparent bg-surface-2 px-3 py-2.5 text-text-muted transition-colors focus-within:border-primary/40 focus-within:bg-surface focus-within:shadow-soft">
            <Search className="h-4 w-4 transition-colors group-focus-within:text-primary" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search friends…"
              className="w-full bg-transparent text-sm text-text placeholder:text-text-muted focus:outline-none"
              aria-label="Search friends to forward to"
              autoFocus
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
          {showSelf ? (
            <ForwardRow
              name="Saved messages"
              handle="Message yourself"
              icon={<Bookmark className="h-4 w-4" />}
              busy={pendingId === "self"}
              disabled={forward.isPending}
              onClick={() => sessionUser && send(sessionUser._id, "self")}
            />
          ) : null}

          {isLoading ? (
            <p className="px-3 py-4 text-sm text-text-muted">Loading friends…</p>
          ) : friends.length === 0 ? (
            <p className="px-3 py-4 text-sm text-text-muted">
              {query ? "No matching friends." : "Add friends to forward messages to them."}
            </p>
          ) : (
            friends.map((f) => (
              <ForwardRow
                key={f.user._id}
                name={f.user.displayName}
                handle={f.user.username ? `@${f.user.username}` : ""}
                avatar={f.user.avatar}
                busy={pendingId === f.user._id}
                disabled={forward.isPending}
                onClick={() => send(f.user._id, f.user._id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ForwardRow({
  name,
  handle,
  avatar,
  icon,
  busy,
  disabled,
  onClick,
}: {
  name: string;
  handle: string;
  avatar?: string;
  icon?: React.ReactNode;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
    >
      <Avatar name={name} src={avatar} size="md" icon={icon} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text">{name}</span>
        {handle ? <span className="block truncate font-mono text-[11px] text-text-muted">{handle}</span> : null}
      </span>
      {busy ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
      ) : (
        <Send className="h-4 w-4 shrink-0 text-text-muted" />
      )}
    </button>
  );
}
