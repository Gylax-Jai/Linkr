import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChatListItem } from "@linkr/shared";
import { api } from "@/lib/api";
import { useUIStore } from "@/lib/store";
import { readCachedChatList, writeCachedChatList } from "./chatListCache";

export const chatKeys = {
  all: ["chats"] as const,
  list: () => [...chatKeys.all, "list"] as const,
  messages: (chatId: string) => [...chatKeys.all, "messages", chatId] as const,
  groupMembers: (chatId: string) => [...chatKeys.all, "group-members", chatId] as const,
};

export function useChatList() {
  return useQuery({
    queryKey: chatKeys.list(),
    queryFn: async () => {
      const res = await api.get<{ chats: ChatListItem[] }>("/chat");
      writeCachedChatList(res.data.chats);
      return res.data.chats;
    },
    staleTime: 4_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    placeholderData: readCachedChatList,
  });
}

export function useCreateGroupMutation() {
  const queryClient = useQueryClient();
  const setActiveChat = useUIStore((s) => s.setActiveChat);

  return useMutation({
    mutationFn: async ({ name, memberIds }: { name: string; memberIds: string[] }) => {
      const res = await api.post<{ chatId: string }>("/chat/group", { name, memberIds });
      return res.data.chatId;
    },
    onSuccess: (chatId) => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
      setActiveChat(chatId);
    },
  });
}

export function useCreateChatMutation() {
  const queryClient = useQueryClient();
  const setActiveChat = useUIStore((s) => s.setActiveChat);

  return useMutation({
    mutationFn: async (participantId: string) => {
      const res = await api.post<{ chatId: string }>("/chat", { participantId });
      return res.data.chatId;
    },
    onSuccess: (chatId) => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
      setActiveChat(chatId);
    },
  });
}

export function useChatById(chatId: string | null) {
  const { data: chats } = useChatList();
  if (!chatId || !chats) return undefined;
  return chats.find((c) => c._id === chatId);
}

/** Per-user delete: hide a chat from the current user's list (the other member keeps history). */
export function useDeleteChatMutation() {
  const queryClient = useQueryClient();
  const activeChatId = useUIStore((s) => s.activeChatId);
  const setActiveChat = useUIStore((s) => s.setActiveChat);

  return useMutation({
    mutationFn: async (chatId: string) => {
      await api.delete(`/chat/${chatId}`);
      return chatId;
    },
    onSuccess: (chatId) => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
      if (activeChatId === chatId) setActiveChat(null);
    },
  });
}

export function usePinChatMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ chatId, pinned }: { chatId: string; pinned: boolean }) => {
      await api.patch(`/chat/${chatId}/pin`, { pinned });
      return { chatId, pinned };
    },
    onMutate: async ({ chatId, pinned }) => {
      await queryClient.cancelQueries({ queryKey: chatKeys.list() });
      const previous = queryClient.getQueryData<ChatListItem[]>(chatKeys.list());
      queryClient.setQueryData<ChatListItem[]>(chatKeys.list(), (old) =>
        old?.map((c) => (c._id === chatId ? { ...c, pinned } : c)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(chatKeys.list(), context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });
}

/** Mute/unmute a chat's notifications (Phase 4). Optimistic, mirrors the pin pattern. */
export function useMuteChatMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ chatId, muted }: { chatId: string; muted: boolean }) => {
      await api.patch(`/chat/${chatId}/mute`, { muted });
      return { chatId, muted };
    },
    onMutate: async ({ chatId, muted }) => {
      await queryClient.cancelQueries({ queryKey: chatKeys.list() });
      const previous = queryClient.getQueryData<ChatListItem[]>(chatKeys.list());
      queryClient.setQueryData<ChatListItem[]>(chatKeys.list(), (old) =>
        old?.map((c) => (c._id === chatId ? { ...c, muted } : c)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(chatKeys.list(), context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });
}

/** Archive/unarchive a chat (Phase 4). Optimistic; archived chats live in their own list section. */
export function useArchiveChatMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ chatId, archived }: { chatId: string; archived: boolean }) => {
      await api.patch(`/chat/${chatId}/archive`, { archived });
      return { chatId, archived };
    },
    onMutate: async ({ chatId, archived }) => {
      await queryClient.cancelQueries({ queryKey: chatKeys.list() });
      const previous = queryClient.getQueryData<ChatListItem[]>(chatKeys.list());
      queryClient.setQueryData<ChatListItem[]>(chatKeys.list(), (old) =>
        old?.map((c) => (c._id === chatId ? { ...c, archived } : c)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(chatKeys.list(), context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });
}
