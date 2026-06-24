import { useEffect, useState } from "react";
import { Flag, Loader2, X } from "lucide-react";
import {
  REPORT_DETAILS_MAX,
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  type ReportReason,
} from "@linkr/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useReportUserMutation } from "./useFriends";

interface ReportTarget {
  userId: string;
  name: string;
}

/**
 * Report a user (Phase 4). Pick a reason, optionally add details (required for "Something else"),
 * and submit. Friends-or-not: anyone you can see can be reported. Bottom sheet on mobile, centered
 * dialog on desktop. Shows a brief confirmation, then closes.
 */
export function ReportUserModal({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  const report = useReportUserMutation();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [done, setDone] = useState(false);

  // Reset the form each time the modal is opened for a (possibly different) user.
  useEffect(() => {
    if (target) {
      setReason(null);
      setDetails("");
      setDone(false);
      report.reset();
    }
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  if (!target) return null;

  const needsDetails = reason === "other";
  const canSubmit = Boolean(reason) && (!needsDetails || details.trim().length > 0) && !report.isPending;

  const submit = async () => {
    if (!reason || !canSubmit) return;
    await report.mutateAsync({ userId: target.userId, reason, details: details.trim() || undefined });
    setDone(true);
    window.setTimeout(onClose, 1200);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-bg/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md animate-fade-in-up rounded-t-3xl border border-border bg-surface shadow-elevated sm:rounded-3xl">
        <div className="flex items-center justify-between gap-2 border-b border-border p-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rose-500/15 text-rose-500">
              <Flag className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-text">Report {target.name}</h2>
              <p className="truncate text-xs text-text-muted">Reports are confidential.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-text-muted hover:bg-surface-2 hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="p-6 text-center">
            <p className="text-sm font-medium text-text">Thanks for letting us know.</p>
            <p className="mt-1 text-xs text-text-muted">Our team will review this report.</p>
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <fieldset className="space-y-1.5">
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
                Why are you reporting?
              </legend>
              {REPORT_REASONS.map((r) => (
                <label
                  key={r}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm transition-colors",
                    reason === r ? "border-primary/50 bg-primary/10 text-text" : "border-border bg-surface-2 text-text hover:bg-surface",
                  )}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    className="h-4 w-4 accent-primary"
                  />
                  {REPORT_REASON_LABELS[r]}
                </label>
              ))}
            </fieldset>

            <div className="space-y-1.5">
              <label htmlFor="report-details" className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Details {needsDetails ? <span className="text-rose-500">*</span> : <span className="normal-case">(optional)</span>}
              </label>
              <textarea
                id="report-details"
                value={details}
                onChange={(e) => setDetails(e.target.value.slice(0, REPORT_DETAILS_MAX))}
                rows={3}
                placeholder="Add anything that will help us understand the problem."
                className="w-full resize-none rounded-2xl border border-border bg-surface-2 px-3 py-2.5 text-sm text-text placeholder:text-text-muted focus:border-primary/40 focus:bg-surface focus:outline-none"
              />
              <p className="text-right text-[11px] text-text-muted">
                {details.length}/{REPORT_DETAILS_MAX}
              </p>
            </div>

            {report.isError ? (
              <p className="text-xs text-rose-500">Couldn't submit your report. Please try again.</p>
            ) : null}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1"
                disabled={!canSubmit}
                onClick={() => void submit()}
              >
                {report.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
                <span className="ml-1.5">Report</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
