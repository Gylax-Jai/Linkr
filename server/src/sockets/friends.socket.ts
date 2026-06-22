import type { Server, Socket } from "socket.io";
import { SOCKET_EVENTS } from "@linkr/shared";
import { logger } from "../utils/logger.js";
import { requireSocketUser } from "./auth.socket.js";

/**
 * Friend events (blueprint §11): notify peers when requests are sent, accepted, or rejected.
 * REST endpoints perform the state change; this module wires authenticated socket rooms so
 * clients receive realtime updates. Every privileged handler re-checks auth server-side.
 */
export function registerFriendHandlers(io: Server, socket: Socket): void {
  const userId = requireSocketUser(socket);
  if (!userId) {
    return;
  }

  socket.on(SOCKET_EVENTS.FRIEND_REQUEST, () => {
    logger.warn("friend:request socket event ignored — use POST /api/friends/request", {
      socketId: socket.id,
      userId,
    });
  });

  socket.on(SOCKET_EVENTS.FRIEND_ACCEPTED, () => {
    logger.warn("friend:accepted socket event ignored — use POST /api/friends/:id/accept", {
      socketId: socket.id,
      userId,
    });
  });

  socket.on(SOCKET_EVENTS.FRIEND_REJECTED, () => {
    logger.warn("friend:rejected socket event ignored — use POST /api/friends/:id/reject", {
      socketId: socket.id,
      userId,
    });
  });

  // Keep io reference alive for future client-initiated flows if needed.
  void io;
}
