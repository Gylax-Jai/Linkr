import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import type { ChatListItem } from "@linkr/shared";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store";
import { useLeaveGroupMutation } from "./useGroupAdmin";
import { useGroupMembers } from "./useGroupMembers";

/**
 * Sole admin leaving a group must pick a successor. Regular members get a simple confirm elsewhere.
 */
export function LeaveGroupModal({
  chat,
  open,
  onClose,
}: {
  chat: ChatListItem | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const userId = useAuthStore((s) => s.user?._id);
  const leave = useLeaveGroupMutation(chat?._id ?? null);
  const { data: members = [] } = useGroupMembers(chat?._id ?? null, open);
  const [successorId, setSuccessorId] = useState("");

  if (!open || !chat?.group || !userId) return null;

  const others = members.filter((m) => m._id !== userId);
  const admins = chat.group.admins;
  const isSoleAdmin = chat.group.isAdmin && admins.filter((id) => id === userId).length > 0 && admins.length === 1;

  const submit = async () => {
    if (isSoleAdmin && !successorId) return;
    try {
      await leave.mutateAsync(isSoleAdmin ? successorId : undefined);
      onClose();
    } catch {
      /* toast handled by caller if needed */
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-bg/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-elevated">
        <h2 className="text-base font-semibold text-text">Leave group?</h2>
        <p className="mt-2 text-sm text-text-muted">
          {isSoleAdmin
            ? "You're the only admin. Choose someone to take over before you leave."
            : "You won't receive messages from this group anymore."}
        </p>
        {isSoleAdmin ? (
          <select
            value={successorId}
            onChange={(e) => setSuccessorId(e.target.value)}
            className="mt-4 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
          >
            <option value="">Select new admin…</option>
            {others.map((m) => (
              <option key={m._id} value={m._id}>
                {m.displayName}
              </option>
            ))}
          </select>
        ) : null}
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={leave.isPending}>
            Cancel
          </Button>
          <Button
            variant="ghost"
            className="flex-1 text-red-500 hover:bg-red-500/10 hover:text-red-500"
            disabled={leave.isPending || (isSoleAdmin && !successorId)}
            onClick={() => void submit()}
          >
            {leave.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            Leave
          </Button>
        </div>
      </div>
    </div>
  );
}
