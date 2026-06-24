import { useMutation } from "@tanstack/react-query";
import type { DeleteAccountInput } from "@linkr/shared";
import { api } from "@/lib/api";
import { disconnectSocket } from "@/lib/socket";
import { useAuthStore } from "@/lib/store";

interface DeleteAccountResponse {
  ok: true;
  purged?: boolean;
  scheduledPurgeAt?: string;
}

/**
 * Delete the signed-in account (Phase 4). `mode: "scheduled"` deactivates with a 15-day reversible
 * grace window; `mode: "immediate"` purges everything now. The server clears the refresh cookie and
 * destroys sessions; on success we tear down the socket and clear local auth so the app drops to the
 * login screen. Errors (e.g. a confirmation mismatch) leave the session intact.
 */
export function useDeleteAccountMutation() {
  const clear = useAuthStore((s) => s.clear);
  return useMutation({
    mutationFn: async (input: DeleteAccountInput) => {
      const res = await api.post<DeleteAccountResponse>("/users/me/delete", input);
      return res.data;
    },
    onSuccess: () => {
      disconnectSocket();
      clear();
    },
  });
}
