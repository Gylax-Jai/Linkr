import { useEffect, useMemo } from "react";
import type { MessageDTO } from "@linkr/shared";
import { useCryptoStore } from "@/lib/crypto";

/** Searchable body for a message (decrypted when E2EE; skips calls and deleted-for-everyone). */
function messageSearchText(message: MessageDTO, plaintext: Record<string, string | null>): string {
  if (message.deletedForEveryone || message.type === "call") return "";
  let text = "";
  if (message.encrypted) {
    const cached = plaintext[message._id];
    if (typeof cached === "string") text = cached;
  } else if (message.content) {
    text = message.content;
  }
  if (message.mediaName) text = text ? `${text} ${message.mediaName}` : message.mediaName;
  return text;
}

/**
 * Client-side in-chat search over loaded messages. Decrypts E2EE bodies into the crypto cache first
 * so matches work on plaintext the user can read (server only stores ciphertext).
 */
export function useChatInMessageSearch(
  chatId: string | null,
  messages: MessageDTO[],
  query: string,
  enabled: boolean,
): { matchIds: string[] } {
  const status = useCryptoStore((s) => s.status);
  const plaintext = useCryptoStore((s) => s.plaintext);

  useEffect(() => {
    if (!enabled || !chatId || status !== "ready") return;
    for (const m of messages) {
      if (m.encrypted && m.content && !m.deletedForEveryone && m.type !== "call") {
        if (plaintext[m._id] === undefined) {
          useCryptoStore.getState().decryptInto(m._id, m.content);
        }
      }
    }
  }, [enabled, chatId, messages, status, plaintext]);

  const matchIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !chatId) return [];
    return messages
      .filter((m) => messageSearchText(m, plaintext).toLowerCase().includes(q))
      .map((m) => m._id);
  }, [chatId, messages, plaintext, query]);

  return { matchIds };
}
