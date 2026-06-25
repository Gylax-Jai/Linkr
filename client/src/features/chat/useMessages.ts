import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChatListItem, MessageDTO } from "@linkr/shared";
import { SOCKET_EVENTS } from "@linkr/shared";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket/client";
import { useAuthStore } from "@/lib/store";
import { useCryptoStore } from "@/lib/crypto";
import { chatKeys } from "./useChats";
import { patchListLastMessage, writeCachedChatList } from "./chatListCache";

/** Groups use socket cache patches only — skip list/message refetch after send (1:1 unchanged). */
function isGroupChatId(
  queryClient: ReturnType<typeof useQueryClient>,
  chatId: string,
): boolean {
  return (
    queryClient.getQueryData<ChatListItem[]>(chatKeys.list())?.find((c) => c._id === chatId)?.type ===
    "group"
  );
}

/** Find the chat's encryption target (1:1/self only). Groups send plaintext. */
function resolveRecipientId(
  queryClient: ReturnType<typeof useQueryClient>,
  chatId: string,
): string | undefined {
  const chat = queryClient.getQueryData<ChatListItem[]>(chatKeys.list())?.find((c) => c._id === chatId);
  if (!chat || chat.type === "group") return undefined;
  return chat.participant?._id;
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
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: chatKeys.messages(chatId ?? ""),
    enabled: Boolean(chatId),
    queryFn: async () => {
      const res = await api.get<{ messages: MessageDTO[] }>(`/chat/${chatId}/messages`);
      return res.data.messages;
    },
    staleTime: 60_000,
  });

  // Keep sidebar preview in sync when the thread loads (list API can lag or omit call meta).
  useEffect(() => {
    if (!chatId || !query.data?.length) return;
    const last = query.data[query.data.length - 1];
    queryClient.setQueryData<ChatListItem[]>(chatKeys.list(), (old) => {
      const next = patchListLastMessage(old, chatId, last);
      if (next && next !== old) writeCachedChatList(next);
      return next;
    });
  }, [chatId, query.data, queryClient]);

  return query;
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
      if (!chatId || isGroupChatId(queryClient, chatId)) return;
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
        queryClient.setQueryData<ChatListItem[]>(chatKeys.list(), (old) => {
          const next = patchListLastMessage(old, chatId, message);
          if (next && next !== old) writeCachedChatList(next);
          return next;
        });
      }
    },
  });
}

/**
 * Forward a message to a friend (Phase 4). For media the server copies the stored attachment; for a
 * text message we re-encrypt the plaintext for the TARGET peer client-side (E2EE never leaves the
 * client) and pass it as `content`. The decrypted plaintext comes from the crypto cache (an
 * encrypted bubble is decrypted as soon as it renders) or directly from a plaintext message.
 */
export function useForwardMessageMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ message, targetUserId }: { message: MessageDTO; targetUserId: string }) => {
      const isMedia = Boolean(message.mediaUrl);

      let body: { targetUserId: string; content?: string; encrypted?: boolean } = { targetUserId };

      if (!isMedia) {
        let text = "";
        if (message.encrypted && message.content) {
          const store = useCryptoStore.getState();
          store.decryptInto(message._id, message.content);
          text = useCryptoStore.getState().plaintext[message._id] ?? "";
        } else {
          text = message.content ?? "";
        }
        if (!text.trim()) throw new Error("This message can't be forwarded");
        const prepared = await useCryptoStore.getState().encryptText(text, [targetUserId]);
        body = { targetUserId, content: prepared.content, encrypted: prepared.encrypted };
      }

      const res = await api.post<{ message: MessageDTO }>(`/chat/messages/${message._id}/forward`, body);
      return res.data.message;
    },
    onSuccess: (message) => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.messages(message.chatId) });
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
      if (!chatId || isGroupChatId(queryClient, chatId)) return;
      void queryClient.invalidateQueries({ queryKey: chatKeys.messages(chatId) });
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });
}

/** Optimistically mark peer messages as read in the thread cache (prevents mark-read effect loops). */
function patchMessagesReadByUser(
  queryClient: ReturnType<typeof useQueryClient>,
  chatId: string,
  userId: string,
): void {
  queryClient.setQueryData<MessageDTO[]>(chatKeys.messages(chatId), (old) => {
    if (!old?.length) return old;
    let changed = false;
    const next = old.map((m) => {
      if (m.sender === userId || m.readBy.includes(userId)) return m;
      changed = true;
      return { ...m, readBy: [...m.readBy, userId], status: "read" as const };
    });
    return changed ? next : old;
  });
}

export function useMarkReadMutation(chatId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!chatId) return [] as MessageDTO[];
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit(SOCKET_EVENTS.MESSAGE_READ, { chatId });
      }
      const res = await api.patch<{ ok: true; messages: MessageDTO[] }>(`/chat/${chatId}/read`);
      return res.data.messages ?? [];
    },
    onMutate: () => {
      if (!chatId) return;
      const userId = useAuthStore.getState().user?._id;
      if (userId) patchMessagesReadByUser(queryClient, chatId, userId);

      queryClient.setQueryData<ChatListItem[]>(chatKeys.list(), (old) => {
        if (!old) return old;
        const next = old.map((c) => (c._id === chatId && c.unreadCount ? { ...c, unreadCount: 0 } : c));
        writeCachedChatList(next);
        return next;
      });
    },
    onSuccess: (messages) => {
      if (!chatId) return;
      if (messages.length > 0) {
        queryClient.setQueryData<MessageDTO[]>(chatKeys.messages(chatId), (old) => {
          if (!old) return messages;
          const byId = new Map(messages.map((m) => [m._id, m]));
          return old.map((m) => byId.get(m._id) ?? m);
        });
      }
      queryClient.setQueryData<ChatListItem[]>(chatKeys.list(), (old) => {
        if (!old) return old;
        const next = old.map((c) => (c._id === chatId ? { ...c, unreadCount: 0 } : c));
        writeCachedChatList(next);
        return next;
      });
    },
  });
}
