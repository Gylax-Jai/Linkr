import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search, Users, X } from "lucide-react";
import { GROUP_MAX_MEMBERS, GROUP_NAME_MAX } from "@linkr/shared";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/button";
import { useFriends } from "@/features/friends";
import { cn } from "@/lib/utils";
import { useCreateGroupMutation } from "./useChats";

/**
 * Create a group chat (Phase 6): pick friends, name the group, POST /api/chat/group.
 * Groups are plaintext at rest (not E2EE); voice/video calls are disabled in v1.
 */
export function CreateGroupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, isLoading } = useFriends();
  const createGroup = useCreateGroupMutation();
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setName("");
      setSelected(new Set());
    }
  }, [open]);

  const friends = useMemo(() => {
    const accepted = (data?.friends ?? []).filter((f) => f.status === "accepted");
    const q = query.trim().toLowerCase();
    if (!q) return accepted;
    return accepted.filter(
      (f) =>
        f.user.displayName.toLowerCase().includes(q) || f.user.username?.toLowerCase().includes(q),
    );
  }, [data, query]);

  const maxPick = GROUP_MAX_MEMBERS - 1;
  const canSubmit = name.trim().length > 0 && selected.size >= 1 && !createGroup.isPending;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < maxPick) next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (!canSubmit) return;
    await createGroup.mutateAsync({ name: name.trim(), memberIds: [...selected] });
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-bg/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          "relative z-10 flex max-h-[85vh] w-full max-w-md flex-col rounded-t-3xl border border-border bg-surface shadow-elevated sm:rounded-3xl",
          "animate-fade-in-up",
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-border p-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text">New group</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              Up to {GROUP_MAX_MEMBERS} members · not end-to-end encrypted
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

        <div className="space-y-3 border-b border-border p-4">
          <label className="block text-xs font-medium text-text-muted" htmlFor="group-name">
            Group name
          </label>
          <input
            id="group-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, GROUP_NAME_MAX))}
            placeholder="Weekend crew"
            maxLength={GROUP_NAME_MAX}
            className="w-full rounded-2xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-text placeholder:text-text-muted focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-[11px] text-text-muted">
            {selected.size} selected · min 1 friend · max {maxPick} friends
          </p>
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
              aria-label="Search friends for group"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
          {isLoading ? (
            <p className="px-3 py-4 text-sm text-text-muted">Loading friends…</p>
          ) : friends.length === 0 ? (
            <p className="px-3 py-4 text-sm text-text-muted">
              {query ? "No matching friends." : "Add friends to create a group."}
            </p>
          ) : (
            friends.map((f) => {
              const picked = selected.has(f.user._id);
              const disabled = !picked && selected.size >= maxPick;
              return (
                <button
                  key={f.user._id}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(f.user._id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors",
                    picked ? "bg-primary/10" : "hover:bg-surface-2",
                    disabled && "opacity-50",
                  )}
                >
                  <Avatar name={f.user.displayName} src={f.user.avatar} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text">{f.user.displayName}</span>
                    {f.user.username ? (
                      <span className="block truncate font-mono text-xs text-text-muted">@{f.user.username}</span>
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      "grid h-6 w-6 shrink-0 place-items-center rounded-full border",
                      picked ? "border-primary bg-primary text-primary-foreground" : "border-border",
                    )}
                  >
                    {picked ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-border p-4">
          <Button variant="gradient" className="w-full" disabled={!canSubmit} onClick={() => void submit()}>
            {createGroup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            Create group
          </Button>
        </div>
      </div>
    </div>
  );
}
