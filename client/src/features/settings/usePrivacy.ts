import { useMutation } from "@tanstack/react-query";
import type { PrivacyUpdateInput, SessionUser } from "@linkr/shared";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

/**
 * Update the signed-in user's privacy settings (Phase 4). Hits the existing
 * `PATCH /api/users/me/privacy` endpoint and pushes the refreshed session user into the auth store
 * so visibility changes apply everywhere without a reload.
 */
export function useUpdatePrivacyMutation() {
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: async (input: PrivacyUpdateInput) => {
      const res = await api.patch<{ user: SessionUser }>("/users/me/privacy", input);
      return res.data.user;
    },
    onSuccess: (user) => {
      setUser(user);
    },
  });
}
