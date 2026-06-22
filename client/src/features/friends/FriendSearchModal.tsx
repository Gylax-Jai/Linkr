import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { FriendSearch } from "./FriendSearch";
import { cn } from "@/lib/utils";

/** Modal overlay for finding friends and starting new chats. */
export function FriendSearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-bg/60 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        className={cn(
          "relative z-10 w-full max-w-md rounded-t-3xl border border-border bg-surface p-4 shadow-elevated sm:rounded-3xl",
          "animate-fade-in-up",
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text">Find friends</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close find friends"
            className="grid h-8 w-8 place-items-center rounded-full text-text-muted hover:bg-surface-2 hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <FriendSearch onClose={onClose} />
      </div>
    </div>
  );
}
