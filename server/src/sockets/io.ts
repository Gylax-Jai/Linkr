import type { Server } from "socket.io";

let socketServer: Server | null = null;

/** Store the Socket.IO server for emitting realtime events from services. */
export function setSocketServer(io: Server): void {
  socketServer = io;
}

export function getSocketServer(): Server | null {
  return socketServer;
}
