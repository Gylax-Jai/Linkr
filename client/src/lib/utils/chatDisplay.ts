import type { ChatListItem } from "@linkr/shared";

export function isGroupChat(chat: ChatListItem): boolean {
  return chat.type === "group";
}

export function isSelfChatItem(chat: ChatListItem): boolean {
  return chat.type === "self";
}

export function chatDisplayName(chat: ChatListItem): string {
  if (chat.type === "self") return "Self chat";
  if (chat.type === "group") return chat.group?.name ?? "Group";
  return chat.participant?.displayName ?? "Chat";
}

export function chatAvatarSrc(chat: ChatListItem): string | undefined {
  if (chat.type === "group") return chat.group?.avatar;
  return chat.participant?.avatar;
}

export function memberNameById(chat: ChatListItem, memberId: string): string {
  if (chat.type === "group") {
    return chat.group?.members.find((m) => m._id === memberId)?.displayName ?? "Member";
  }
  return chat.participant?.displayName ?? "Member";
}
