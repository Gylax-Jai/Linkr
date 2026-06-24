import type { MessageDTO } from "@linkr/shared";

export type DecryptedPreview =
  | { state: "plain"; text: string }
  | { state: "pending" }
  | { state: "failed" };

/** Whether a message can produce a non-empty sidebar preview. */
export function isPreviewableMessage(message: MessageDTO): boolean {
  if (message.deletedForEveryone) return true;
  if (message.type === "call") return true;
  if (message.content) return true;
  if (message.mediaUrl || message.mediaType === "image") return true;
  return false;
}

/** Format the sidebar / notification preview for a message (no React hooks). */
export function formatMessagePreview(
  last: MessageDTO,
  userId: string,
  decrypted: DecryptedPreview = { state: "plain", text: last.content ?? "" },
): string {
  const prefix = last.sender === userId ? "You: " : "";

  if (last.deletedForEveryone) {
    return `${prefix}Message deleted`;
  }

  if (last.type === "call") {
    const kind = last.call?.media === "video" ? "Video call" : "Voice call";
    if (!last.call) return `${prefix}📞 ${kind}`;
    if (last.call.outcome === "missed" || last.call.outcome === "cancelled") {
      return last.sender === userId ? `📞 ${kind} (no answer)` : `📞 Missed ${kind.toLowerCase()}`;
    }
    if (last.call.outcome === "declined") return `📞 ${kind} declined`;
    if (last.call.outcome === "completed" && typeof last.call.durationSec === "number") {
      const mins = Math.floor(last.call.durationSec / 60);
      const secs = last.call.durationSec % 60;
      const dur = mins > 0 ? `${mins}:${String(secs).padStart(2, "0")}` : `0:${String(secs).padStart(2, "0")}`;
      return `${prefix}📞 ${kind} · ${dur}`;
    }
    return `${prefix}📞 ${kind}`;
  }

  if (last.content) {
    if (decrypted.state === "pending") return `${prefix}Decrypting…`;
    if (decrypted.state === "failed") return `${prefix}🔒 Encrypted message`;
    return `${prefix}${decrypted.text}`;
  }

  if (last.mediaType === "image") return `${prefix}📷 Photo`;
  if (last.mediaUrl) return `${prefix}📎 ${last.mediaName ?? "File"}`;

  return "No messages yet";
}
