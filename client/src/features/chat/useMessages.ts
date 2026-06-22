import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChatListItem, MessageDTO } from "@linkr/shared";
import { SOCKET_EVENTS } from "@linkr/shared";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket/client";
import { useAuthStore } from "@/lib/store";
import { useCryptoStore } from "@/lib/crypto";
import { chatKeys } from "./useChats";

/** Find the 1:1 chat's other member from the cached chat list (used to pick an encryption target). */
function resolveRecipientId(
  queryClient: ReturnType<typeof useQueryClient>,
  chatId: string,
): string | undefined {
  const list = queryClient.getQueryData<ChatListItem[]>(chatKeys.list());
  return list?.find((c) => c._id === chatId)?.participant._id;
}

/**
 * Encrypt a text body for the chat peer when possible (Phase 2). Returns the wire `content` +
 * `encrypted` flag. Falls back to plaintext when the peer is unknown or has no published key (e.g.
 * the dev bot) so the message stays readable end-to-end where supported, in transit otherwise.
 */
async function prepareOutgoing(
  queryClient: ReturnType<typeof useQueryClient>,
  chatId: string,
  content: string,
): Promise<{ content: string; encrypted: boolean }> {
  const recipientId = resolveRecipientId(queryClient, chatId);
  if (!recipientId) return { content, encrypted: false };
  return useCryptoStore.getState().encryptText(content, [recipientId]);
}

export function useMessages(chatId: string | null) {
  return useQuery({
    queryKey: chatKeys.messages(chatId ?? ""),
    enabled: Boolean(chatId),
    queryFn: async () => {
      const res = await api.get<{ messages: MessageDTO[] }>(`/chat/${chatId}/messages`);
      return res.data.messages;
    },
  });
}

/** Replace a message in the cache by id (used by edit/delete/react responses). */
function patchCachedMessage(
  queryClient: ReturnType<typeof useQueryClient>,
  chatId: string,
  next: MessageDTO,
): void {
  queryClient.setQueryData<MessageDTO[]>(chatKeys.messages(chatId), (old) =>
    old?.map((m) => (m._id === next._id ? next : m)),
  );
}

export interface SendMessageArgs {
  content: string;
  replyTo?: string;
}

export function useSendMessageMutation(chatId: string | null) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?._id);

  return useMutation({
    mutationFn: async ({ content, replyTo }: SendMessageArgs) => {
      const socket = getSocket();
      if (!socket?.connected || !chatId) {
        throw new Error("Not connected");
      }

      const { content: payload, encrypted } = await prepareOutgoing(queryClient, chatId, content);

      return new Promise<MessageDTO>((resolve, reject) => {
        socket.emit(
          SOCKET_EVENTS.MESSAGE_SEND,
          { chatId, content: payload, encrypted, replyTo },
          (err?: string) => {
            if (err) {
              reject(new Error(err));
              return;
            }
            resolve({
              _id: `pending-${Date.now()}`,
              chatId,
              sender: userId ?? "",
              type: "text",
              content,
              status: "sent",
              readBy: userId ? [userId] : [],
              createdAt: new Date().toISOString(),
              reactions: [],
              deletedForEveryone: false,
            });
          },
        );
      });
    },
    onMutate: async ({ content }) => {
      if (!chatId || !userId) return;

      await queryClient.cancelQueries({ queryKey: chatKeys.messages(chatId) });
      const previous = queryClient.getQueryData<MessageDTO[]>(chatKeys.messages(chatId));

      const optimistic: MessageDTO = {
        _id: `opt-${Date.now()}`,
        chatId,
        sender: userId,
        type: "text",
        content,
        status: "sent",
        readBy: [userId],
        createdAt: new Date().toISOString(),
        reactions: [],
        deletedForEveryone: false,
      };

      queryClient.setQueryData<MessageDTO[]>(chatKeys.messages(chatId), (old) => [
        ...(old ?? []),
        optimistic,
      ]);

      return { previous };
    },
    onError: (_err, _args, context) => {
      if (!chatId || !context?.previous) return;
      queryClient.setQueryData(chatKeys.messages(chatId), context.previous);
    },
    onSettled: () => {
      if (!chatId) return;
      void queryClient.invalidateQueries({ queryKey: chatKeys.messages(chatId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });
}

export function useEditMessageMutation(chatId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      const { content: payload, encrypted } = chatId
        ? await prepareOutgoing(queryClient, chatId, content)
        : { content, encrypted: false };
      const res = await api.patch<{ message: MessageDTO }>(`/chat/messages/${messageId}`, {
        content: payload,
        encrypted,
      });
      return res.data.message;
    },
    onSuccess: (message) => {
      if (chatId) patchCachedMessage(queryClient, chatId, message);
    },
  });
}

export function useDeleteMessageMutation(chatId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, scope }: { messageId: string; scope: "me" | "everyone" }) => {
      const res = await api.delete<{ message: MessageDTO }>(`/chat/messages/${messageId}`, {
        data: { scope },
      });
      return { message: res.data.message, scope };
    },
    onSuccess: ({ message, scope }) => {
      if (!chatId) return;
      if (scope === "me") {
        queryClient.setQueryData<MessageDTO[]>(chatKeys.messages(chatId), (old) =>
          old?.filter((m) => m._id !== message._id),
        );
      } else {
        patchCachedMessage(queryClient, chatId, message);
      }
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });
}

export function useReactMessageMutation(chatId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      const res = await api.post<{ message: MessageDTO }>(`/chat/messages/${messageId}/react`, { emoji });
      return res.data.message;
    },
    onSuccess: (message) => {
      if (chatId) patchCachedMessage(queryClient, chatId, message);
    },
  });
}

/**
 * Upload an attachment via multipart/form-data (Sprint 5). The server validates + stores the file,
 * creates the message, and broadcasts MESSAGE_NEW to both members — so the socket handler renders
 * it; no optimistic insert is needed here.
 */
export function useUploadMediaMutation(chatId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, caption }: { file: File; caption?: string }) => {
      if (!chatId) throw new Error("No active chat");
      const form = new FormData();
      form.append("file", file);
      if (caption?.trim()) form.append("caption", caption.trim());
      const res = await api.post<{ message: MessageDTO }>(`/chat/${chatId}/media`, form);
      return res.data.message;
    },
    onSettled: () => {
      if (!chatId) return;
      void queryClient.invalidateQueries({ queryKey: chatKeys.messages(chatId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });
}

export function useMarkReadMutation(chatId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const socket = getSocket();
      if (!socket?.connected || !chatId) return;
      socket.emit(SOCKET_EVENTS.MESSAGE_READ, { chatId });
    },
    // Optimistically clear this chat's sidebar unread badge as soon as we mark it read (e.g. when
    // opening a chat that had an unread last message). The server records the read on the same
    // socket event, so later list refetches stay at 0 — fixing the badge that used to stick at "1"
    // while the chat was open.
    onMutate: () => {
      if (!chatId) return;
      queryClient.setQueryData<ChatListItem[]>(chatKeys.list(), (old) =>
        old?.map((c) => (c._id === chatId && c.unreadCount ? { ...c, unreadCount: 0 } : c)),
      );
    },
  });
}
