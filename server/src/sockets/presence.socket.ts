import type { Server, Socket } from "socket.io";
import { SOCKET_EVENTS } from "@linkr/shared";
import { UserModel } from "../models/User.js";
import { FriendshipModel } from "../models/Friendship.js";
import { allowsPresenceBroadcast } from "../modules/users/privacy.helpers.js";
import { deliverAllPendingMessagesForUser } from "../modules/chat/chat.service.js";
import { deliverPendingCalls, onUserSocketConnected, onUserSocketDisconnected } from "./calls.socket.js";
import { registerUserSocket, unregisterUserSocket } from "./socket-registry.js";
import { requireSocketUser } from "./auth.socket.js";
import { registerTypingHandler } from "./chat.socket.js";

/** Track socket connections per user for online presence. */
const userSockets = new Map<string, Set<string>>();

async function getFriendIds(userId: string): Promise<string[]> {
  const friendships = await FriendshipModel.find({
    status: "accepted",
    $or: [{ requester: userId }, { recipient: userId }],
  }).select("requester recipient");

  return friendships.map((f) => {
    const requesterId = f.requester.toString();
    return requesterId === userId ? f.recipient.toString() : requesterId;
  });
}

async function broadcastToFriends(
  io: Server,
  userId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const friendIds = await getFriendIds(userId);
  for (const friendId of friendIds) {
    io.to(`user:${friendId}`).emit(event, payload);
  }
}

/**
 * Presence events (blueprint §11): user:online / user:offline / user:typing.
 */
export function registerPresenceHandlers(io: Server, socket: Socket): void {
  const userId = requireSocketUser(socket);
  if (!userId) return;

  registerTypingHandler(io, socket);

  registerUserSocket(userId, socket.id);
  onUserSocketConnected(io, userId);

  void (async () => {
    let sockets = userSockets.get(userId);
    if (!sockets) {
      sockets = new Set();
      userSockets.set(userId, sockets);
    }
    sockets.add(socket.id);

    if (sockets.size === 1) {
      const user = await UserModel.findById(userId).select("privacy");
      await UserModel.findByIdAndUpdate(userId, { online: true, lastSeen: new Date() });
      if (user && allowsPresenceBroadcast(user.privacy)) {
        await broadcastToFriends(io, userId, SOCKET_EVENTS.USER_ONLINE, { userId });
      }
      deliverPendingCalls(io, userId);

      const delivered = await deliverAllPendingMessagesForUser(userId);
      for (const message of delivered) {
        io.to(`user:${message.sender}`).emit(SOCKET_EVENTS.MESSAGE_DELIVERED, { message });
      }
    }
  })();

  socket.on("disconnect", () => {
    const isLast = unregisterUserSocket(userId, socket.id);
    if (isLast) onUserSocketDisconnected(io, userId);

    void (async () => {
      const sockets = userSockets.get(userId);
      if (!sockets) return;

      sockets.delete(socket.id);
      if (sockets.size === 0) {
        userSockets.delete(userId);
        const lastSeen = new Date();
        await UserModel.findByIdAndUpdate(userId, { online: false, lastSeen });
        const user = await UserModel.findById(userId).select("privacy");
        if (user && allowsPresenceBroadcast(user.privacy)) {
          await broadcastToFriends(io, userId, SOCKET_EVENTS.USER_OFFLINE, {
            userId,
            lastSeen: lastSeen.toISOString(),
          });
        }
      }
    })();
  });
}
