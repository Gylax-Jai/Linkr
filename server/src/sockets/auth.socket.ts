import type { ExtendedError, Socket } from "socket.io";
import { UserModel } from "../models/User.js";
import { verifyAccessToken } from "../utils/jwt.js";

/** Optional JWT auth for Socket.IO — attaches `socket.data.userId` and joins a per-user room. */
export async function socketAuthMiddleware(
  socket: Socket,
  next: (err?: ExtendedError) => void,
): Promise<void> {
  try {
    const authToken = socket.handshake.auth?.token as string | undefined;
    const header = socket.handshake.headers.authorization;
    const headerToken =
      typeof header === "string" && header.toLowerCase().startsWith("bearer ")
        ? header.slice(7)
        : undefined;
    const token = authToken ?? headerToken;

    if (!token) {
      next(new Error("Unauthorized"));
      return;
    }

    const userId = verifyAccessToken(token);
    const user = await UserModel.findById(userId);
    if (!user) {
      next(new Error("Unauthorized"));
      return;
    }

    socket.data.userId = userId;
    await socket.join(`user:${userId}`);
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
}

export function requireSocketUser(socket: Socket): string | null {
  const userId = socket.data.userId as string | undefined;
  return userId ?? null;
}
