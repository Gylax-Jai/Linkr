import { useMutation } from "@tanstack/react-query";
import type { AuthResponse } from "@linkr/shared";
import { api } from "@/lib/api";
import { disconnectSocket } from "@/lib/socket";
import { useAuthStore } from "@/lib/store";

/** Exchange a Google ID token (credential) for a Linkr session. */
export function useGoogleLoginMutation() {
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: async (idToken: string) => {
      const res = await api.post<AuthResponse>("/auth/google", { idToken });
      return res.data;
    },
    onSuccess: setSession,
  });
}

/** Clear the server refresh cookie + local session. */
export function useLogoutMutation() {
  const clear = useAuthStore((s) => s.clear);
  return useMutation({
    mutationFn: async () => {
      await api.post("/auth/logout");
    },
    onSettled: () => {
      disconnectSocket();
      clear();
    },
  });
}
