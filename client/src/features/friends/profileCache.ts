import type { ChatListItem, ChatParticipant, FriendsListResponse, UserSearchResult } from "@linkr/shared";
import type { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { chatKeys } from "@/features/chat/useChats";

const friendsKey = ["friends"] as const;

/** Merge a privacy-gated profile row into every React Query cache that might show this user. */
export function mergePeerProfile(queryClient: QueryClient, profile: UserSearchResult): void {
  const userId = profile._id;

  queryClient.setQueryData<UserSearchResult>(
    ["users", "profile", userId],
    (prev) => (prev ? { ...prev, ...profile, friendship: profile.friendship ?? prev.friendship } : profile),
  );

  queryClient.setQueriesData<UserSearchResult[]>(
    { queryKey: ["users", "search"] },
    (old) => old?.map((row) => (row._id === userId ? { ...row, ...profile, friendship: profile.friendship ?? row.friendship } : row)),
  );

  queryClient.setQueryData<ChatListItem[]>(chatKeys.list(), (old) => {
    if (!old) return old;
    return old.map((chat) => {
      if (!chat.participant || chat.participant._id !== userId) return chat;
      return { ...chat, participant: mergeParticipant(chat.participant, profile) };
    });
  });

  queryClient.setQueryData<FriendsListResponse>(friendsKey, (old) => {
    if (!old) return old;
    return {
      ...old,
      friends: old.friends.map((row) =>
        row.user._id === userId
          ? {
              ...row,
              user: {
                ...row.user,
                displayName: profile.displayName,
                avatar: profile.avatar,
                username: profile.username,
              },
            }
          : row,
      ),
    };
  });
}

function mergeParticipant(participant: ChatParticipant, profile: UserSearchResult): ChatParticipant {
  return {
    ...participant,
    displayName: profile.displayName,
    username: profile.username,
    avatar: profile.avatar,
    bio: profile.bio,
    status: profile.status,
    online: profile.online ?? participant.online,
    lastSeen: profile.lastSeen ?? participant.lastSeen,
    presenceVisible: profile.presenceVisible,
    profileDetailsVisible: profile.profileDetailsVisible,
    contactCardVisible: profile.contactCardVisible,
    avatarZoomable: profile.avatarZoomable,
  };
}

/** Fetch the latest privacy-gated profile and patch caches (no invalidation — avoids modal flicker). */
export async function refreshPeerProfileInCaches(
  queryClient: QueryClient,
  userId: string,
): Promise<void> {
  try {
    const res = await api.get<{ profile: UserSearchResult }>(`/users/${userId}/profile`);
    mergePeerProfile(queryClient, res.data.profile);
  } catch {
    /* viewer may no longer be allowed to see this user */
  }
}
