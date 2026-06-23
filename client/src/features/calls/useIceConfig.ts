import type { IceConfigResponse } from "@linkr/shared";
import { api } from "@/lib/api";

/**
 * Fetch fresh STUN/TURN servers for a call. TURN credentials are short-lived, so we always fetch
 * right before (re)connecting rather than caching across calls.
 */
export async function fetchIceConfig(): Promise<RTCIceServer[]> {
  try {
    const res = await api.get<IceConfigResponse>("/calls/ice-config");
    return res.data.iceServers as RTCIceServer[];
  } catch {
    // Fall back to public STUN so same-network calls still work if the API is unreachable.
    return [{ urls: ["stun:stun.l.google.com:19302"] }];
  }
}
