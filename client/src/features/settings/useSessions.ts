import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SessionListResponse } from "@linkr/shared";
import { api } from "@/lib/api";

/**
 * Device/session management hooks (Sprint E). The server tracks one session per signed-in device;
 * these power the "Devices" screen where a user can see and remotely revoke them.
 */

const SESSIONS_KEY = ["sessions"] as const;

/** List the current account's signed-in devices (current device flagged). */
export function useSessionsQuery() {
  return useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: async () => {
      const res = await api.get<SessionListResponse>("/sessions");
      return res.data.sessions;
    },
  });
}

/** Revoke a single device by id. The current device's id signs the caller out (handled by caller). */
export function useRevokeSessionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const res = await api.delete<{ current: boolean }>(`/sessions/${sessionId}`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}

/** Sign out of every OTHER device, keeping the current one. */
export function useRevokeOtherSessionsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.delete<{ revoked: number }>("/sessions/others");
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}
