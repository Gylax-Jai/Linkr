import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChatListItem } from "@linkr/shared";
import { api } from "@/lib/api";
import { useUIStore } from "@/lib/store";

export const chatKeys = {
  all: ["chats"] as const,
  list: () => [...chatKeys.all, "list"] as const,
  messages: (chatId: string) => [...chatKeys.all, "messages", chatId] as const,
};

export function useChatList() {
  return useQuery({
    queryKey: chatKeys.list(),
    queryFn: async () => {
      const res = await api.get<{ chats: ChatListItem[] }>("/chat");
      return res.data.chats;
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
