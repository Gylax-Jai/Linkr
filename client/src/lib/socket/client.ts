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

  socket?.disconnect();

  socket = io(API_URL, {
    auth: { token },
    withCredentials: true,
    autoConnect: true,
  });

  return socket;
}

/** Tear down the socket connection (logout). */
export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
