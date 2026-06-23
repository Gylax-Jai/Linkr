import type { Server } from "socket.io";
import { logger } from "../utils/logger.js";
import { socketAuthMiddleware } from "./auth.socket.js";
import { registerPresenceHandlers } from "./presence.socket.js";
import { registerChatHandlers } from "./chat.socket.js";
import { registerFriendHandlers } from "./friends.socket.js";
import { registerCallHandlers } from "./calls.socket.js";

/**
 * Central Socket.IO wiring. Feature handlers are split per concern (presence/chat/friends)
 * and registered per connection. Auth + friendship checks run before privileged events
 * (blueprint §5, §11).
 */
export function registerSocketHandlers(io: Server): void {
  io.use(socketAuthMiddleware);

  io.on("connection", (socket) => {
    logger.info("Socket connected", { id: socket.id, userId: socket.data.userId });

    registerPresenceHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerFriendHandlers(io, socket);
    registerCallHandlers(io, socket);

    socket.on("disconnect", (reason) => {
      logger.info("Socket disconnected", { id: socket.id, reason });
    });
  });
}
