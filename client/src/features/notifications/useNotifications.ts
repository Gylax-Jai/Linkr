import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationDTO } from "@linkr/shared";
import { api } from "@/lib/api";

export const notificationKeys = {
  all: ["notifications"] as const,
  list: () => [...notificationKeys.all, "list"] as const,
  unread: () => [...notificationKeys.all, "unread"] as const,
};

/** Recent notifications (newest first). */
export function useNotifications() {
  return useQuery({
    queryKey: notificationKeys.list(),
    queryFn: async () => {
      const res = await api.get<{ notifications: NotificationDTO[] }>("/notifications");
      return res.data.notifications;
    },
  });
}

/** Unread notification count (drives the bell badge). */
export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unread(),
    queryFn: async () => {
      const res = await api.get<{ count: number }>("/notifications/unread-count");
      return res.data.count;
    },
  });
}

/** Mark all notifications read (optimistically clears the badge). */
export function useMarkNotificationsReadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.patch("/notifications/read");
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: notificationKeys.all });
      const prevList = queryClient.getQueryData<NotificationDTO[]>(notificationKeys.list());
      const prevCount = queryClient.getQueryData<number>(notificationKeys.unread());
      queryClient.setQueryData<NotificationDTO[]>(notificationKeys.list(), (old) =>
        old?.map((n) => ({ ...n, read: true })),
      );
      queryClient.setQueryData<number>(notificationKeys.unread(), 0);
      return { prevList, prevCount };
    },
    onError: (_err, _vars, context) => {
      if (context?.prevList) queryClient.setQueryData(notificationKeys.list(), context.prevList);
      if (context?.prevCount !== undefined) {
        queryClient.setQueryData(notificationKeys.unread(), context.prevCount);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
