import { create } from "zustand";
import type { SessionUser } from "@linkr/shared";

/**
 * Auth session state (blueprint §4). The access token lives in memory only (never localStorage)
 * and is refreshed via the HttpOnly refresh cookie. `status` drives the route guards and the
 * session-restore loading screen.
 */
export type AuthStatus = "loading" | "authed" | "guest";

interface AuthState {
  accessToken: string | null;
  user: SessionUser | null;
  status: AuthStatus;
  setSession: (session: { user: SessionUser; accessToken: string }) => void;
  setUser: (user: SessionUser) => void;
  setStatus: (status: AuthStatus) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  status: "loading",
  setSession: ({ user, accessToken }) => set({ user, accessToken, status: "authed" }),
  setUser: (user) => set({ user }),
  setStatus: (status) => set({ status }),
  clear: () => set({ accessToken: null, user: null, status: "guest" }),
}));
