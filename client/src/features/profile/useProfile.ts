import { useMutation } from "@tanstack/react-query";
import type { ProfileUpdateInput, SessionUser } from "@linkr/shared";
import { api } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

export function useUpdateProfileMutation() {
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: async (input: ProfileUpdateInput) => {
      const res = await api.patch<{ user: SessionUser }>("/users/me", input);
      return res.data.user;
    },
    onSuccess: (user) => {
      setUser(user);
    },
  });
}

/**
 * Upload a new profile photo (multipart). The server validates + stores it (same hardening as chat
 * media) and returns the refreshed session user; we push it into the auth store so the avatar
 * updates everywhere immediately. Let the browser set the multipart boundary (no manual headers).
 */
export function useUpdateAvatarMutation() {
  const setUser = useAuthStore((s) => s.setUser);

  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await api.post<{ user: SessionUser }>("/users/me/avatar", form);
      return res.data.user;
    },
    onSuccess: (user) => {
      setUser(user);
    },
  });
}
