import { useState } from "react";
import { POLL_MAX_OPTIONS, POLL_MIN_OPTIONS, POLL_OPTION_TEXT_MAX, POLL_QUESTION_MAX } from "@linkr/shared";
import { X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Portal } from "@/components/ui/Portal";

export function PollCreateModal({
  open,
  onClose,
  onSubmit,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: { question: string; options: string[] }) => void;
  pending?: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);

  if (!open) return null;

  const trimmedOptions = options.map((o) => o.trim()).filter(Boolean);
  const canSubmit =
    question.trim().length > 0 &&
    trimmedOptions.length >= POLL_MIN_OPTIONS &&
    !pending;

  const reset = () => {
    setQuestion("");
    setOptions(["", ""]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const addOption = () => {
    if (options.length >= POLL_MAX_OPTIONS) return;
    setOptions((prev) => [...prev, ""]);
  };

  const updateOption = (index: number, value: string) => {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  };

  const removeOption = (index: number) => {
    if (options.length <= POLL_MIN_OPTIONS) return;
    setOptions((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-4 sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="poll-modal-title"
        onClick={handleClose}
      >
        <div
          className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-soft"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 id="poll-modal-title" className="text-lg font-semibold">
              Create poll
            </h2>
            <button
              type="button"
              aria-label="Close"
              className="grid h-8 w-8 place-items-center rounded-full text-text-muted hover:bg-surface-2"
              onClick={handleClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <label className="mb-1 block text-xs font-medium text-text-muted">Question</label>
          <input
            type="text"
            value={question}
            maxLength={POLL_QUESTION_MAX}
            placeholder="Ask something…"
            className="mb-4 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            onChange={(e) => setQuestion(e.target.value)}
          />

          <p className="mb-2 text-xs font-medium text-text-muted">Options</p>
          <div className="space-y-2">
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <input
                  type="text"
                  value={opt}
                  maxLength={POLL_OPTION_TEXT_MAX}
                  placeholder={`Option ${i + 1}`}
                  className="min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  onChange={(e) => updateOption(i, e.target.value)}
                />
                {options.length > POLL_MIN_OPTIONS ? (
                  <button
                    type="button"
                    aria-label={`Remove option ${i + 1}`}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-text-muted hover:bg-surface-2"
                    onClick={() => removeOption(i)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          {options.length < POLL_MAX_OPTIONS ? (
            <button
              type="button"
              className="mt-3 flex items-center gap-1 text-sm text-primary hover:underline"
              onClick={addOption}
            >
              <Plus className="h-4 w-4" />
              Add option
            </button>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={handleClose} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="gradient"
              disabled={!canSubmit}
              onClick={() => {
                onSubmit({ question: question.trim(), options: trimmedOptions });
                reset();
              }}
            >
              {pending ? "Sending…" : "Send poll"}
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
