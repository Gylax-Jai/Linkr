import type { MessageDTO } from "@linkr/shared";
import { cn } from "@/lib/utils";

export function PollBubble({
  message,
  userId,
  onVote,
  disabled,
}: {
  message: MessageDTO;
  userId: string | undefined;
  onVote: (optionId: string) => void;
  disabled?: boolean;
}) {
  const poll = message.poll;
  if (!poll) return null;

  const totalVotes = poll.votes.length;
  const myVote = userId ? poll.votes.find((v) => v.user === userId)?.optionId : undefined;

  return (
    <div className="min-w-[12rem] max-w-[min(100%,20rem)] space-y-2">
      <p className="text-sm font-semibold leading-snug">{poll.question}</p>
      <div className="space-y-1.5">
        {poll.options.map((opt) => {
          const count = poll.votes.filter((v) => v.optionId === opt.id).length;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const selected = myVote === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={disabled}
              onClick={() => onVote(opt.id)}
              className={cn(
                "relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-sm transition-colors",
                selected
                  ? "border-primary bg-primary/10"
                  : "border-border bg-surface/60 hover:border-primary/40",
                disabled && "cursor-default opacity-70",
              )}
            >
              {totalVotes > 0 ? (
                <span
                  className="absolute inset-y-0 left-0 bg-primary/15 transition-[width]"
                  style={{ width: `${pct}%` }}
                  aria-hidden
                />
              ) : null}
              <span className="relative flex items-center justify-between gap-2">
                <span>{opt.text}</span>
                <span className="shrink-0 text-xs text-text-muted">
                  {totalVotes > 0 ? `${pct}%` : count > 0 ? count : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-text-muted">
        {totalVotes === 0 ? "No votes yet" : `${totalVotes} vote${totalVotes === 1 ? "" : "s"}`}
      </p>
    </div>
  );
}
