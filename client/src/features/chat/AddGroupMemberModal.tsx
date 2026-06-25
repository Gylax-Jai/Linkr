import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, UserPlus, X } from "lucide-react";
import type { ChatListItem } from "@linkr/shared";
import { Avatar } from "@/components/ui/Avatar";
import { useFriends } from "@/features/friends";
import { useAddGroupMemberMutation } from "./useGroupAdmin";
import { useGroupMembers } from "./useGroupMembers";

/** Pick a friend to add to an existing group (admin only). */
export function AddGroupMemberModal({
  chat,
  open,
  onClose,
}: {
  chat: ChatListItem | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useFriends();
  const addMember = useAddGroupMemberMutation(chat?._id ?? null);
  const { data: roster = [] } = useGroupMembers(chat?._id ?? null, open);
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const memberIds = useMemo(() => new Set(roster.map((m) => m._id)), [roster]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setPendingId(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const friends = useMemo(() => {
    const accepted = (data?.friends ?? []).filter((f) => f.status === "accepted" && !memberIds.has(f.user._id));
    const q = query.trim().toLowerCase();
    if (!q) return accepted;
    return accepted.filter(
      (f) =>
        f.user.displayName.toLowerCase().includes(q) || f.user.username?.toLowerCase().includes(q),
    );
  }, [data, query, memberIds]);

  if (!open || !chat) return null;

  const add = async (userId: string) => {
    if (addMember.isPending) return;
    setPendingId(userId);
    try {
      await addMember.mutateAsync(userId);
      onClose();
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-bg/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex max-h-[80vh] w-full max-w-md flex-col rounded-t-3xl border border-border bg-surface shadow-elevated sm:rounded-3xl animate-fade-in-up">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h2 className="text-base font-semibold text-text">Add member</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-text-muted hover:bg-surface-2">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-3">
          <div className="flex items-center gap-2 rounded-2xl bg-surface-2 px-3 py-2.5">
            <Search className="h-4 w-4 text-text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search friends…"
              className="w-full bg-transparent text-sm focus:outline-none"
              autoFocus
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {isLoading ? (
            <p className="px-3 py-4 text-sm text-text-muted">Loading friends…</p>
          ) : friends.length === 0 ? (
            <p className="px-3 py-4 text-sm text-text-muted">
              {query ? "No matching friends." : "All your friends are already in this group."}
            </p>
          ) : (
            friends.map((f) => (
              <button
                key={f.user._id}
                type="button"
                disabled={addMember.isPending}
                onClick={() => add(f.user._id)}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-surface-2"
              >
                <Avatar name={f.user.displayName} src={f.user.avatar} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{f.user.displayName}</span>
                {pendingId === f.user._id ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <UserPlus className="h-4 w-4 text-primary" />}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
