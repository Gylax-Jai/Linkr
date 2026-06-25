import { useEffect, useState } from "react";
import { Check, Loader2, MessageSquareLock, X } from "lucide-react";
import type { ChatListItem, GroupMessagePermission } from "@linkr/shared";
import { Portal } from "@/components/ui/Portal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUpdateGroupMessagePermissionMutation } from "./useGroupAdmin";

const OPTIONS: { value: GroupMessagePermission; label: string; hint: string }[] = [
  { value: "everyone", label: "Everyone", hint: "All members can send messages" },
  { value: "admins", label: "Admin only", hint: "Only admins can send messages" },
];

/** Admin-only: choose who may send messages in a group. */
export function GroupMessagePermissionModal({
  chat,
  open,
  onClose,
}: {
  chat: ChatListItem | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const current = chat?.group?.messagePermission ?? "everyone";
  const [selected, setSelected] = useState<GroupMessagePermission>(current);
  const update = useUpdateGroupMessagePermissionMutation(chat?._id ?? null);

  useEffect(() => {
    if (open) setSelected(current);
  }, [open, current]);

  if (!open || !chat?.group?.isAdmin) return null;

  const save = async () => {
    if (selected === current) {
      onClose();
      return;
    }
    try {
      await update.mutateAsync(selected);
      onClose();
    } catch {
      /* ignore — user can retry */
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
        <button type="button" aria-label="Close" className="absolute inset-0 bg-bg/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative z-10 w-full max-w-sm rounded-t-2xl border border-border bg-surface p-5 shadow-elevated sm:rounded-2xl">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/15 text-primary">
                <MessageSquareLock className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-text">Message permission</h2>
                <p className="text-xs text-text-muted">Who can send messages in this group</p>
              </div>
            </div>
            <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1 text-text-muted hover:bg-surface-2">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2">
            {OPTIONS.map((opt) => {
              const active = selected === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelected(opt.value)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                    active ? "border-primary bg-primary/10" : "border-border bg-surface-2 hover:bg-surface",
                  )}
                >
                  <span className="flex-1">
                    <span className="block text-sm font-medium text-text">{opt.label}</span>
                    <span className="block text-xs text-text-muted">{opt.hint}</span>
                  </span>
                  {active ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={onClose} disabled={update.isPending}>
              Cancel
            </Button>
            <Button variant="gradient" className="flex-1" disabled={update.isPending} onClick={() => void save()}>
              {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
