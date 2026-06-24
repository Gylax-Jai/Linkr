import type { ChatListItem } from "@linkr/shared";

const STORAGE_KEY = "linkr.chats.list";

/** Instant sidebar paint on reload — last successful chat list from this tab. */
export function readCachedChatList(): ChatListItem[] | undefined {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as ChatListItem[];
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeCachedChatList(chats: ChatListItem[]): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  } catch {
    /* quota / private mode */
  }
}

/** Patch one chat row's lastMessage preview from a loaded message thread. */
export function patchListLastMessage(
  chats: ChatListItem[] | undefined,
  chatId: string,
  last: ChatListItem["lastMessage"],
): ChatListItem[] | undefined {
  if (!chats || !last) return chats;
  return chats.map((c) => {
    if (c._id !== chatId) return c;
    const prev = c.lastMessage;
    if (prev && prev._id === last._id) return c;
    if (prev?.createdAt && new Date(last.createdAt) <= new Date(prev.createdAt)) return c;
    return { ...c, lastMessage: last, updatedAt: last.createdAt };
  });
}
