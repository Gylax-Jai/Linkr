import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Trash2, UserX, X } from "lucide-react";
import { isAxiosError } from "axios";
import { ACCOUNT_DELETION_GRACE_DAYS } from "@linkr/shared";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useDeleteAccountMutation } from "./useAccount";

type DeleteMode = "scheduled" | "immediate";

/**
 * Danger zone (Phase 4): deactivate (15-day reversible) or permanently delete the account. Each
 * action opens a confirmation dialog that requires typing the exact username/email so it can't fire
 * by accident. On success the session is cleared and the app returns to the login screen.
 */
export function DangerZoneCard() {
  const [mode, setMode] = useState<DeleteMode | null>(null);

  return (
    <section className="space-y-3 rounded-2xl border border-rose-500/30 bg-surface p-5 shadow-soft">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-rose-500">
          <AlertTriangle className="h-4 w-4" />
          Danger zone
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          Take a break or leave for good. Deactivating is reversible for {ACCOUNT_DELETION_GRACE_DAYS} days; deleting is permanent.
        </p>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setMode("scheduled")}
          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface-2 p-3.5 text-left transition-colors hover:bg-surface"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-text-muted">
            <UserX className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-text">Deactivate account</span>
            <span className="block text-xs text-text-muted">
              Hidden and signed out everywhere. Log back in within {ACCOUNT_DELETION_GRACE_DAYS} days to restore it.
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setMode("immediate")}
          className="flex w-full items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-3.5 text-left transition-colors hover:bg-rose-500/10"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rose-500/15 text-rose-500">
            <Trash2 className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-rose-500">Delete account permanently</span>
            <span className="block text-xs text-text-muted">
              Erases your profile, chats and messages immediately. This can't be undone.
            </span>
          </span>
        </button>
      </div>

      <DeleteAccountDialog mode={mode} onClose={() => setMode(null)} />
    </section>
  );
}

function DeleteAccountDialog({ mode, onClose }: { mode: DeleteMode | null; onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const del = useDeleteAccountMutation();
  const [confirm, setConfirm] = useState("");

  // The exact string the user must type (matches the server check: username, else email).
  const expected = user?.username ?? user?.email ?? "";

  useEffect(() => {
    if (mode) {
      setConfirm("");
      del.reset();
    }
  }, [mode]);

  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode, onClose]);

  if (!mode) return null;

  const immediate = mode === "immediate";
  const matches = confirm.trim().toLowerCase() === expected.trim().toLowerCase() && expected.length > 0;
  const canSubmit = matches && !del.isPending;

  const errorMessage = del.isError
    ? isAxiosError(del.error) && typeof del.error.response?.data === "object"
      ? ((del.error.response?.data as { message?: string }).message ?? "Something went wrong. Please try again.")
      : "Something went wrong. Please try again."
    : null;

  const submit = () => {
    if (!canSubmit) return;
    del.mutate({ mode, confirm: confirm.trim() });
    // On success the auth store clears and the route guard returns us to login — no manual nav needed.
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-bg/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md animate-fade-in-up rounded-t-3xl border border-border bg-surface shadow-elevated sm:rounded-3xl">
        <div className="flex items-center justify-between gap-2 border-b border-border p-4">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-full",
                immediate ? "bg-rose-500/15 text-rose-500" : "bg-surface-2 text-text-muted",
              )}
            >
              {immediate ? <Trash2 className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
            </span>
            <h2 className="text-base font-semibold text-text">
              {immediate ? "Delete account permanently" : "Deactivate account"}
            </h2>
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

        <div className="space-y-4 p-4">
          <p className="text-sm leading-relaxed text-text-muted">
            {immediate ? (
              <>
                This <span className="font-semibold text-text">immediately and permanently</span> erases your profile,
                chats and messages. It cannot be undone.
              </>
            ) : (
              <>
                Your account will be hidden and signed out on every device. If you log back in within{" "}
                <span className="font-semibold text-text">{ACCOUNT_DELETION_GRACE_DAYS} days</span> it's fully restored —
                after that it's permanently deleted.
              </>
            )}
          </p>

          <div className="space-y-1.5">
            <label htmlFor="delete-confirm" className="text-xs font-medium text-text">
              Type <span className="font-mono font-semibold text-text">{expected}</span> to confirm
            </label>
            <input
              id="delete-confirm"
              type="text"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full rounded-2xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-text placeholder:text-text-muted focus:border-primary/40 focus:bg-surface focus:outline-none"
              placeholder={expected}
            />
          </div>

          {errorMessage ? <p className="text-xs text-rose-500">{errorMessage}</p> : null}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              className={cn("flex-1", immediate && "bg-rose-500 text-white hover:bg-rose-600")}
              disabled={!canSubmit}
              onClick={submit}
            >
              {del.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : immediate ? (
                <Trash2 className="h-4 w-4" />
              ) : (
                <UserX className="h-4 w-4" />
              )}
              <span className="ml-1.5">{immediate ? "Delete forever" : "Deactivate"}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
