import { Download, FileText } from "lucide-react";
import type { MessageDTO } from "@linkr/shared";
import { useAuthedObjectUrl } from "@/lib/hooks/useAuthedObjectUrl";
import { cn } from "@/lib/utils";

/** Absolute URLs (Cloudinary) are public; relative ones hit the authenticated download route. */
function isAbsolute(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

function ImageMessage({ message }: { message: MessageDTO }) {
  const { src, loading, error } = useAuthedObjectUrl(message.mediaUrl);

  if (error) {
    return <div className="rounded-xl bg-black/10 px-3 py-2 text-xs opacity-80">Image unavailable</div>;
  }
  if (!src || loading) {
    return <div className="h-40 w-56 max-w-full animate-pulse rounded-xl bg-black/10" aria-hidden="true" />;
  }

  return (
    <button
      type="button"
      onClick={() => window.open(src, "_blank", "noopener,noreferrer")}
      className="block overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={message.mediaName ?? "Open image"}
    >
      <img
        src={src}
        alt={message.mediaName ?? "Shared image"}
        className="max-h-72 max-w-full rounded-xl object-cover"
        loading="lazy"
      />
    </button>
  );
}

function FileMessage({ message, mine }: { message: MessageDTO; mine: boolean }) {
  const { src, loading } = useAuthedObjectUrl(message.mediaUrl);

  const handleDownload = () => {
    if (!src) return;
    const a = document.createElement("a");
    a.href = src;
    a.download = message.mediaName ?? "download";
    a.rel = "noopener noreferrer";
    if (isAbsolute(src)) a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={!src || loading}
      className={cn(
        "flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-60",
        mine
          ? "border-primary-foreground/30 bg-black/10 hover:bg-black/20"
          : "border-border bg-surface-2 hover:bg-surface",
      )}
      title={message.mediaName ? `Download ${message.mediaName}` : "Download"}
    >
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
          mine ? "bg-black/15 text-primary-foreground" : "bg-primary/10 text-primary",
        )}
      >
        <FileText className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{message.mediaName ?? "File"}</span>
        <span className={cn("block text-[11px]", mine ? "text-primary-foreground/70" : "text-text-muted")}>
          {loading ? "Loading…" : formatBytes(message.mediaSize) || "Download"}
        </span>
      </span>
      <Download className={cn("h-4 w-4 shrink-0", mine ? "text-primary-foreground/80" : "text-text-muted")} />
    </button>
  );
}

/** Renders an attachment inside a message bubble (inline image thumbnail or download chip). */
export function MessageMedia({ message, mine }: { message: MessageDTO; mine: boolean }) {
  if (!message.mediaUrl) return null;
  if (message.mediaType === "image") return <ImageMessage message={message} />;
  return <FileMessage message={message} mine={mine} />;
}
