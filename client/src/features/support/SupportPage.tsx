import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, LifeBuoy, Loader2, Send } from "lucide-react";
import { isAxiosError } from "axios";
import { SUPPORT_MESSAGE_MIN } from "@linkr/shared";
import { Button } from "@/components/ui/button";
import { PATHS } from "@/routes/paths";
import { cn } from "@/lib/utils";
import { SUPPORT_MESSAGE_MAX, useSupportContactMutation } from "./useSupportContact";

/** Support page — user queries saved to MongoDB (Phase 7D). */
export function SupportPage() {
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const contact = useSupportContactMutation();

  const trimmed = message.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < SUPPORT_MESSAGE_MIN;
  const canSend = trimmed.length >= SUPPORT_MESSAGE_MIN && trimmed.length <= SUPPORT_MESSAGE_MAX && !contact.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    contact.mutate(trimmed, {
      onSuccess: () => {
        setSent(true);
        setMessage("");
      },
    });
  };

  const errorText =
    contact.isError && isAxiosError(contact.error)
      ? (contact.error.response?.data as { message?: string } | undefined)?.message ??
        "Could not send your message. Please try again."
      : contact.isError
        ? "Could not send your message. Please try again."
        : null;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-bg">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface/80 px-4 shadow-soft backdrop-blur-sm">
        <Link to={PATHS.home}>
          <Button variant="ghost" size="icon" aria-label="Back to chats">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold">Support</h1>
      </header>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col p-6">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
            <LifeBuoy className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-text">Are you having any query?</h2>
            <p className="text-sm text-text-muted">Write your question below and we will get back to you.</p>
          </div>
        </div>

        {sent ? (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-text">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
            <div>
              <p className="font-medium text-emerald-600 dark:text-emerald-400">Message sent</p>
              <p className="mt-1 text-text-muted">Thanks — we received your query and will review it soon.</p>
            </div>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4">
          <div className="space-y-2">
            <textarea
              value={message}
              onChange={(e) => {
                setSent(false);
                setMessage(e.target.value.slice(0, SUPPORT_MESSAGE_MAX));
              }}
              rows={8}
              placeholder="Describe your issue or question…"
              className={cn(
                "w-full resize-none rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text",
                "placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              aria-invalid={tooShort}
            />
            <div className="flex items-center justify-between text-xs text-text-muted">
              <span className={cn(tooShort && "text-red-500")}>
                {tooShort ? `At least ${SUPPORT_MESSAGE_MIN} characters` : " "}
              </span>
              <span>
                {trimmed.length}/{SUPPORT_MESSAGE_MAX}
              </span>
            </div>
          </div>

          {errorText ? <p className="text-sm text-red-500">{errorText}</p> : null}

          <Button type="submit" variant="gradient" disabled={!canSend} className="gap-2 self-start">
            {contact.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {contact.isPending ? "Sending…" : "Send"}
          </Button>
        </form>

        <footer className="mt-auto border-t border-border pt-6 text-center text-xs text-text-muted">
          DEVELOPED BY:{" "}
          <span className="font-medium text-text">@gylaxmw</span>
        </footer>
      </div>
    </div>
  );
}
