import type { ChatListItem, MessageDTO } from "@linkr/shared";

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

function lastMessageChanged(prev: MessageDTO | undefined, next: MessageDTO): boolean {
  if (!prev) return true;
  if (prev._id !== next._id) return true;
  return (
    prev.content !== next.content ||
    prev.deletedForEveryone !== next.deletedForEveryone ||
    prev.type !== next.type ||
    prev.encrypted !== next.encrypted ||
    prev.mediaUrl !== next.mediaUrl ||
    JSON.stringify(prev.call) !== JSON.stringify(next.call)
  );
}

/** Patch one chat row's lastMessage preview from a loaded message thread. */
export function patchListLastMessage(
  chats: ChatListItem[] | undefined,
  chatId: string,
  last: ChatListItem["lastMessage"],
): ChatListItem[] | undefined {
  if (!chats || !last) return chats;

  let changed = false;
  const next = chats.map((c) => {
    if (c._id !== chatId) return c;
    const prev = c.lastMessage;
    if (prev?.createdAt && new Date(last.createdAt) < new Date(prev.createdAt)) return c;
    if (prev && prev._id === last._id && !lastMessageChanged(prev, last)) return c;
    changed = true;
    return { ...c, lastMessage: last, updatedAt: last.createdAt };
  });

  return changed ? sortChatList(next) : chats;
}

/** Keep pinned first, then most recent activity (matches server list order). */
export function sortChatList(chats: ChatListItem[]): ChatListItem[] {
  return [...chats].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const aTime = new Date(a.lastMessage?.createdAt ?? a.updatedAt).getTime();
    const bTime = new Date(b.lastMessage?.createdAt ?? b.updatedAt).getTime();
    return bTime - aTime;
  });
}

/** Patch lastMessage and re-sort — use after socket events. */
export function patchAndSortLastMessage(
  chats: ChatListItem[] | undefined,
  chatId: string,
  last: MessageDTO,
): ChatListItem[] | undefined {
  const patched = patchListLastMessage(chats, chatId, last);
  if (!patched || patched === chats) {
    // Same id but fields changed — patchListLastMessage handles; if still equal, force update
    if (!chats) return chats;
    const row = chats.find((c) => c._id === chatId);
    if (row?.lastMessage?._id === last._id && lastMessageChanged(row.lastMessage, last)) {
      const forced = chats.map((c) =>
        c._id === chatId ? { ...c, lastMessage: last, updatedAt: last.createdAt } : c,
      );
      return sortChatList(forced);
    }
    return patched;
  }
  return patched;
}
