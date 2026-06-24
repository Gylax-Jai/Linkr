import { useEffect, useRef } from "react";
import type { ChatListItem, MessageDTO, NotificationDTO } from "@linkr/shared";
import { SOCKET_EVENTS } from "@linkr/shared";
import { useQueryClient } from "@tanstack/react-query";
import { connectSocket, disconnectSocket, getSocket, reconnectSocket } from "@/lib/socket/client";
import { refreshPeerProfileInCaches } from "@/features/friends/profileCache";
import { useAuthStore, useUIStore } from "@/lib/store";
import { api } from "@/lib/api";
import { notificationKeys } from "@/features/notifications";
import { chatKeys } from "./useChats";
import { patchAndSortLastMessage, writeCachedChatList } from "./chatListCache";

/**
 * Connects Socket.IO when authenticated and keeps React Query caches in sync with realtime events.
 */
export function SocketProvider({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const status = useAuthStore((s) => s.status);
  const queryClient = useQueryClient();
  const setParticipantOnline = useUIStore((s) => s.setParticipantOnline);
  const setTyping = useUIStore((s) => s.setTyping);

  useEffect(() => {
    if (status !== "authed" || !accessToken) {
      disconnectSocket();
      return;
    }

    const socket = connectSocket(accessToken);

    const onNewMessage = ({ message }: { message: MessageDTO }) => {
      queryClient.setQueryData<MessageDTO[]>(chatKeys.messages(message.chatId), (old) => {
        if (!old) return [message];
        if (old.some((m) => m._id === message._id)) return old;
        const filtered = old.filter((m) => !m._id.startsWith("opt-") && !m._id.startsWith("pending-"));
        return [...filtered, message];
      });

      const userId = useAuthStore.getState().user?._id;
      const fromOther = !!userId && message.sender !== userId;
      // Read the active chat id at event time (never a stale closure) so we know whether this message
      // landed in the chat the user is currently viewing.
      const viewingThisChat = fromOther && message.chatId === useUIStore.getState().activeChatId;

      if (viewingThisChat) {
        queryClient.setQueryData<ChatListItem[]>(chatKeys.list(), (old) => {
          const next = patchAndSortLastMessage(old, message.chatId, message);
          if (next) {
            const bumped = next.map((c) =>
              c._id === message.chatId ? { ...c, unreadCount: 0 } : c,
            );
            writeCachedChatList(bumped);
            return bumped;
          }
          return old;
        });
      } else {
        queryClient.setQueryData<ChatListItem[]>(chatKeys.list(), (old) => {
          const userId = useAuthStore.getState().user?._id;
          const patched = patchAndSortLastMessage(old, message.chatId, message);
          if (!patched) return old;
          const next = patched.map((c) => {
            if (c._id !== message.chatId) return c;
            const unread = message.sender !== userId ? (c.unreadCount ?? 0) + 1 : c.unreadCount;
            return { ...c, unreadCount: unread };
          });
          writeCachedChatList(next);
          return next;
        });
      }

      if (fromOther) {
        socket.emit(SOCKET_EVENTS.MESSAGE_DELIVERED, { messageId: message._id });
      }
    };

    const onDelivered = ({ message }: { message: MessageDTO }) => {
      queryClient.setQueryData<MessageDTO[]>(chatKeys.messages(message.chatId), (old) =>
        old?.map((m) => (m._id === message._id ? message : m)),
      );
    };

    const onRead = ({ chatId, messages }: { chatId: string; messages: MessageDTO[] }) => {
      queryClient.setQueryData<MessageDTO[]>(chatKeys.messages(chatId), (old) => {
        if (!old) return messages;
        const byId = new Map(messages.map((m) => [m._id, m]));
        return old.map((m) => byId.get(m._id) ?? m);
      });
      queryClient.setQueryData<ChatListItem[]>(chatKeys.list(), (old) => {
        if (!old) return old;
        const next = old.map((c) => {
          if (c._id !== chatId) return c;
          const last = messages.at(-1);
          return { ...c, unreadCount: 0, ...(last ? { lastMessage: last } : {}) };
        });
        writeCachedChatList(next);
        return next;
      });
    };

    // Edit / delete-for-everyone / react all return the updated message — patch it in place.
    const onMessageUpdated = ({ message }: { message: MessageDTO }) => {
      queryClient.setQueryData<MessageDTO[]>(chatKeys.messages(message.chatId), (old) =>
        old?.map((m) => (m._id === message._id ? message : m)),
      );
      queryClient.setQueryData<ChatListItem[]>(chatKeys.list(), (old) => {
        const next = patchAndSortLastMessage(old, message.chatId, message);
        if (next) writeCachedChatList(next);
        return next ?? old;
      });
    };

    const onOnline = ({ userId }: { userId: string }) => {
      const list = queryClient.getQueryData<ChatListItem[]>(chatKeys.list());
      const row = list?.find((c) => c.participant._id === userId);
      if (row?.participant.presenceVisible === false) return;
      setParticipantOnline(userId, true);
    };

    const onOffline = ({ userId }: { userId: string }) => {
      const list = queryClient.getQueryData<ChatListItem[]>(chatKeys.list());
      const row = list?.find((c) => c.participant._id === userId);
      if (row?.participant.presenceVisible === false) return;
      setParticipantOnline(userId, false);
    };

    const onTyping = ({ chatId }: { chatId: string }) => {
      setTyping(chatId, true);
      window.setTimeout(() => setTyping(chatId, false), 3000);
    };

    // Any friendship change involving us (unfriended / request received / request accepted) should
    // refresh friends, requests, search and the chat list — the chat's participant friendship drives
    // the Add/Accept/Requested controls and the composer gate, so the UI flips without a reload.
    const onFriendChanged = () => {
      void queryClient.invalidateQueries({ queryKey: ["friends"] });
      void queryClient.invalidateQueries({ queryKey: ["users", "search"] });
      void queryClient.invalidateQueries({ queryKey: chatKeys.list() });
    };

    const onNotification = ({ notification }: { notification: NotificationDTO }) => {
      // If this is a "message" notification for the chat the user is *already viewing*, treat it as
      // seen: don't nag with an unread badge. Read the active chat id at event time (getState) so we
      // never use a stale closure. Mark it read on the server (best-effort) so `unread-count` and
      // `list` stay consistent after a later refetch, and insert it as already-read.
      const activeChatId = useUIStore.getState().activeChatId;
      const isViewingThisChat =
        notification.type === "message" && !!notification.chatId && notification.chatId === activeChatId;

      if (isViewingThisChat) {
        void api.patch(`/notifications/${notification._id}/read`).catch(() => {});
        queryClient.setQueryData<NotificationDTO[]>(notificationKeys.list(), (old) => {
          const seen: NotificationDTO = { ...notification, read: true };
          if (!old) return [seen];
          if (old.some((n) => n._id === notification._id)) return old;
          return [seen, ...old];
        });
        return;
      }

      queryClient.setQueryData<NotificationDTO[]>(notificationKeys.list(), (old) => {
        if (!old) return [notification];
        if (old.some((n) => n._id === notification._id)) return old;
        return [notification, ...old];
      });
      queryClient.setQueryData<number>(notificationKeys.unread(), (count) => (count ?? 0) + 1);
    };

    const onProfileChanged = ({ userId }: { userId: string }) => {
      void refreshPeerProfileInCaches(queryClient, userId);
    };

    socket.on(SOCKET_EVENTS.MESSAGE_NEW, onNewMessage);
    socket.on(SOCKET_EVENTS.MESSAGE_DELIVERED, onDelivered);
    socket.on(SOCKET_EVENTS.MESSAGE_READ, onRead);
    socket.on(SOCKET_EVENTS.MESSAGE_EDIT, onMessageUpdated);
    socket.on(SOCKET_EVENTS.MESSAGE_DELETE, onMessageUpdated);
    socket.on(SOCKET_EVENTS.MESSAGE_REACT, onMessageUpdated);
    socket.on(SOCKET_EVENTS.USER_ONLINE, onOnline);
    socket.on(SOCKET_EVENTS.USER_OFFLINE, onOffline);
    socket.on(SOCKET_EVENTS.USER_TYPING, onTyping);
    socket.on(SOCKET_EVENTS.FRIEND_REMOVED, onFriendChanged);
    socket.on(SOCKET_EVENTS.FRIEND_REQUEST, onFriendChanged);
    socket.on(SOCKET_EVENTS.FRIEND_ACCEPTED, onFriendChanged);
    socket.on(SOCKET_EVENTS.NOTIFICATION_NEW, onNotification);
    socket.on(SOCKET_EVENTS.USER_PROFILE_CHANGED, onProfileChanged);

    return () => {
      socket.off(SOCKET_EVENTS.MESSAGE_NEW, onNewMessage);
      socket.off(SOCKET_EVENTS.MESSAGE_DELIVERED, onDelivered);
      socket.off(SOCKET_EVENTS.MESSAGE_READ, onRead);
      socket.off(SOCKET_EVENTS.MESSAGE_EDIT, onMessageUpdated);
      socket.off(SOCKET_EVENTS.MESSAGE_DELETE, onMessageUpdated);
      socket.off(SOCKET_EVENTS.MESSAGE_REACT, onMessageUpdated);
      socket.off(SOCKET_EVENTS.USER_ONLINE, onOnline);
      socket.off(SOCKET_EVENTS.USER_OFFLINE, onOffline);
      socket.off(SOCKET_EVENTS.USER_TYPING, onTyping);
      socket.off(SOCKET_EVENTS.FRIEND_REMOVED, onFriendChanged);
      socket.off(SOCKET_EVENTS.FRIEND_REQUEST, onFriendChanged);
      socket.off(SOCKET_EVENTS.FRIEND_ACCEPTED, onFriendChanged);
      socket.off(SOCKET_EVENTS.NOTIFICATION_NEW, onNotification);
      socket.off(SOCKET_EVENTS.USER_PROFILE_CHANGED, onProfileChanged);
    };
  }, [accessToken, status, queryClient, setParticipantOnline, setTyping]);

  // Reconnect after token refresh so the socket re-authenticates with the new JWT (Phase 4.2).
  const prevTokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (status !== "authed" || !accessToken) {
      prevTokenRef.current = null;
      return;
    }
    if (prevTokenRef.current && prevTokenRef.current !== accessToken && getSocket()?.connected) {
      reconnectSocket(accessToken);
    }
    prevTokenRef.current = accessToken;
  }, [accessToken, status]);

  // Reconnect when the tab becomes visible again (mobile background / laptop sleep).
  useEffect(() => {
    if (status !== "authed" || !accessToken) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") reconnectSocket(accessToken);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [accessToken, status]);

  return <>{children}</>;
}

/** Emit typing indicator (debounced by caller). */
export function emitTyping(chatId: string): void {
  getSocket()?.emit(SOCKET_EVENTS.USER_TYPING, { chatId });
}
