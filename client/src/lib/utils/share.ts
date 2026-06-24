/**
 * Share a contact's PUBLIC profile (Phase 4). Only the name + @username and the app URL are shared —
 * never phone/email (kept private by design). Uses the native share sheet on mobile when available,
 * and falls back to copying a short invite line to the clipboard on desktop.
 *
 * Returns how the share resolved so callers can show the right toast ("Shared" vs "Link copied").
 */
export type ShareResult = "shared" | "copied" | "cancelled" | "unavailable";

interface ShareContactInput {
  displayName: string;
  username?: string;
}

export async function shareContact(contact: ShareContactInput): Promise<ShareResult> {
  const handle = contact.username ? `@${contact.username}` : contact.displayName;
  const url = typeof window !== "undefined" ? window.location.origin : "";
  const text = `Add ${contact.displayName} (${handle}) on Linkr`;

  // Native share sheet (mobile / supported browsers).
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Linkr contact", text, url });
      return "shared";
    } catch (err) {
      // The user dismissing the sheet throws AbortError — treat as a no-op cancel.
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      // Fall through to the clipboard path on any other failure.
    }
  }

  // Desktop fallback: copy a ready-to-paste invite line.
  const payload = url ? `${text} — ${url}` : text;
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(payload);
      return "copied";
    } catch {
      return "unavailable";
    }
  }
  return "unavailable";
}
