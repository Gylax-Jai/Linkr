import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  FriendRequestResponse,
  FriendsListResponse,
  PendingRequestsResponse,
  ReportUserInput,
  UserProfileView,
  UserSearchResult,
} from "@linkr/shared";
import { api } from "@/lib/api";

const friendsKey = ["friends"] as const;
const pendingKey = ["friends", "pending"] as const;

export function useUserSearch(query: string) {
  const trimmed = query.trim().replace(/^@/, "");
  return useQuery({
    queryKey: ["users", "search", trimmed],
    queryFn: async () => {
      const res = await api.get<{ results: UserSearchResult[] }>("/users/search", {
        params: { q: trimmed },
      });
      return res.data.results;
    },
    enabled: trimmed.length >= 1,
    staleTime: 4_000,
    refetchInterval: 5_000,
  });
}

/** Fresh privacy-gated profile for the contact card (polls every 5s while open). */
export function useUserProfile(userId: string | null) {
  return useQuery({
    queryKey: ["users", "profile", userId],
    queryFn: async () => {
      const res = await api.get<{ profile: UserProfileView }>(`/users/${userId}/profile`);
      return res.data.profile;
    },
    enabled: Boolean(userId),
    staleTime: 4_000,
    refetchInterval: 5_000,
  });
}

export function useFriends() {
  return useQuery({
    queryKey: friendsKey,
    queryFn: async () => {
      const res = await api.get<FriendsListResponse>("/friends");
      return res.data;
    },
    staleTime: 4_000,
    refetchInterval: 5_000,
  });
}

export function usePendingRequests() {
  return useQuery({
    queryKey: pendingKey,
    queryFn: async () => {
      const res = await api.get<PendingRequestsResponse>("/friends/pending");
      return res.data;
    },
  });
}

function invalidateFriends(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: friendsKey }),
    queryClient.invalidateQueries({ queryKey: pendingKey }),
    queryClient.invalidateQueries({ queryKey: ["users", "search"] }),
    // Chat list carries the participant's friendship status (drives Block/Unblock in the chat UI).
    queryClient.invalidateQueries({ queryKey: ["chats"] }),
  ]);
}

export function useSendFriendRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (recipientId: string) => {
      const res = await api.post<FriendRequestResponse>("/friends/request", { recipientId });
      return res.data;
    },
    onSuccess: () => invalidateFriends(queryClient),
  });
}

export function useAcceptFriendRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (friendshipId: string) => {
      const res = await api.post<FriendRequestResponse>(`/friends/${friendshipId}/accept`);
      return res.data;
    },
    onSuccess: () => invalidateFriends(queryClient),
  });
}

export function useRejectFriendRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (friendshipId: string) => {
      const res = await api.post<FriendRequestResponse>(`/friends/${friendshipId}/reject`);
      return res.data;
    },
    onSuccess: () => invalidateFriends(queryClient),
  });
}

export function useCancelFriendRequestMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (friendshipId: string) => {
      await api.delete(`/friends/${friendshipId}`);
    },
    onSuccess: () => invalidateFriends(queryClient),
  });
}

export function useBlockUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await api.post<FriendRequestResponse>(`/friends/block/${userId}`);
      return res.data;
    },
    onSuccess: () => invalidateFriends(queryClient),
  });
}

export function useUnblockUserMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await api.post<{ ok: true }>(`/friends/unblock/${userId}`);
      return res.data;
    },
    onSuccess: () => invalidateFriends(queryClient),
  });
}

/** Remove an accepted friend (unfriend). Both users return to strangers; messaging is gated off. */
export function useRemoveFriendMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await api.delete<{ ok: true }>(`/friends/friend/${userId}`);
      return res.data;
    },
    onSuccess: () => invalidateFriends(queryClient),
  });
}

/** Report a user for abuse/spam etc. (Phase 4). Write-only — no list to invalidate. */
export function useReportUserMutation() {
  return useMutation({
    mutationFn: async ({ userId, reason, details }: { userId: string } & ReportUserInput) => {
      await api.post(`/users/${userId}/report`, { reason, details });
    },
  });
}
