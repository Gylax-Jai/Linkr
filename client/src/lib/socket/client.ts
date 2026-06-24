import { io, type Socket } from "socket.io-client";
import { API_URL } from "@/lib/api/config";

let socket: Socket | null = null;

/** Returns the singleton Socket.IO client (null until connected). */
export function getSocket(): Socket | null {
  return socket;
}

/** Connect (or reconnect) the socket with the current access token. */
export function connectSocket(token: string): Socket {
  if (socket?.connected) {
    socket.auth = { token };
    return socket;
  }

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(API_URL, {
    auth: { token },
    withCredentials: true,
    autoConnect: true,
  });

  return socket;
}

/**
 * Force a reconnect with a fresh access token (Phase 4.2). Used after token refresh or when the
 * tab becomes visible again so call/message events aren't missed on a stale socket.
 */
export function reconnectSocket(token: string): void {
  if (!socket) {
    connectSocket(token);
    return;
  }
  socket.auth = { token };
  if (socket.connected) {
    socket.disconnect();
  }
  socket.connect();
}

/** Tear down the socket connection (logout). */
export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
