import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { GroupMessagePermission } from "@linkr/shared";
import { api } from "@/lib/api";
import { useUIStore } from "@/lib/store";
import { chatKeys } from "./useChats";

function invalidateChats(queryClient: ReturnType<typeof useQueryClient>, chatId: string | null) {
  void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
  if (chatId) void queryClient.invalidateQueries({ queryKey: chatKeys.groupMembers(chatId) });
}

export function useUpdateGroupNameMutation(chatId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      if (!chatId) throw new Error("No chat");
      await api.patch(`/chat/group/${chatId}`, { name });
    },
    onSuccess: () => invalidateChats(queryClient, chatId),
  });
}

export function useUploadGroupAvatarMutation(chatId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      if (!chatId) throw new Error("No chat");
      const form = new FormData();
      form.append("file", file);
      const res = await api.post<{ avatarUrl?: string }>(`/chat/group/${chatId}/avatar`, form);
      return res.data.avatarUrl;
    },
    onSuccess: () => invalidateChats(queryClient, chatId),
  });
}

export function useAddGroupMemberMutation(chatId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      if (!chatId) throw new Error("No chat");
      await api.post(`/chat/group/${chatId}/members`, { userId });
    },
    onSuccess: () => invalidateChats(queryClient, chatId),
  });
}

export function useRemoveGroupMemberMutation(chatId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      if (!chatId) throw new Error("No chat");
      await api.delete(`/chat/group/${chatId}/members/${userId}`);
    },
    onSuccess: () => invalidateChats(queryClient, chatId),
  });
}

export function usePromoteGroupAdminMutation(chatId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      if (!chatId) throw new Error("No chat");
      await api.post(`/chat/group/${chatId}/admins/${userId}`);
    },
    onSuccess: () => invalidateChats(queryClient, chatId),
  });
}

export function useDemoteGroupAdminMutation(chatId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      if (!chatId) throw new Error("No chat");
      await api.delete(`/chat/group/${chatId}/admins/${userId}`);
    },
    onSuccess: () => invalidateChats(queryClient, chatId),
  });
}

export function useUpdateGroupMessagePermissionMutation(chatId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (messagePermission: GroupMessagePermission) => {
      if (!chatId) throw new Error("No chat");
      await api.patch(`/chat/group/${chatId}/permissions`, { messagePermission });
    },
    onSuccess: () => invalidateChats(queryClient, chatId),
  });
}

export function useLeaveGroupMutation(chatId: string | null) {
  const queryClient = useQueryClient();
  const setActiveChat = useUIStore((s) => s.setActiveChat);
  const activeChatId = useUIStore((s) => s.activeChatId);

  return useMutation({
    mutationFn: async (newAdminId?: string) => {
      if (!chatId) throw new Error("No chat");
      const res = await api.post<{ deleted: boolean }>(`/chat/group/${chatId}/leave`, {
        ...(newAdminId ? { newAdminId } : {}),
      });
      return res.data;
    },
    onSuccess: () => {
      invalidateChats(queryClient, chatId);
      if (chatId) queryClient.removeQueries({ queryKey: chatKeys.groupMembers(chatId) });
      if (activeChatId === chatId) setActiveChat(null);
    },
  });
}
