import { useQuery } from "@tanstack/react-query";
import type { ChatParticipant } from "@linkr/shared";
import { api } from "@/lib/api";
import { chatKeys } from "./useChats";

/** Lazy-loaded group roster (GET /chat/group/:id/members) — not bundled in GET /chat list. */
export function useGroupMembers(chatId: string | null, enabled = true) {
  return useQuery({
    queryKey: chatKeys.groupMembers(chatId ?? ""),
    enabled: Boolean(chatId) && enabled,
    queryFn: async () => {
      const res = await api.get<{ members: ChatParticipant[] }>(`/chat/group/${chatId}/members`);
      return res.data.members;
    },
    staleTime: 60_000,
  });
}
