import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import type { AuthResponse } from "@linkr/shared";
import { useAuthStore } from "@/lib/store/auth.store";
import { API_URL } from "./config";

/**
 * Typed axios client (blueprint §10). Sends cookies (`withCredentials`) so the HttpOnly refresh
 * cookie flows, attaches the in-memory access token, and transparently refreshes once on a 401
 * before retrying. If the refresh fails, the session is cleared (logout).
 */
export const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
  headers: { Accept: "application/json" },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Endpoints that must never trigger the refresh-retry loop.
const NO_REFRESH = ["/auth/refresh", "/auth/google", "/auth/logout"];

// A single in-flight refresh shared across concurrent 401s.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await axios.post<AuthResponse>(`${API_URL}/api/auth/refresh`, null, {
      withCredentials: true,
    });
    useAuthStore.getState().setSession(res.data);
    return res.data.accessToken;
  } catch {
    useAuthStore.getState().clear();
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const isAuthRoute = NO_REFRESH.some((path) => original?.url?.includes(path));

    if (error.response?.status === 401 && original && !original._retry && !isAuthRoute) {
      original._retry = true;
      refreshPromise = refreshPromise ?? refreshAccessToken();
      const token = await refreshPromise;
      refreshPromise = null;
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
    }
    return Promise.reject(error);
  },
);

/**
 * Restore a session on app load: exchange the refresh cookie for a fresh access token.
 * Sets the store to `authed` on success or `guest` on failure.
 */
export async function restoreSession(): Promise<void> {
  await refreshAccessToken().then((token) => {
    if (!token) {
      useAuthStore.getState().setStatus("guest");
    }
  });
}
