/** Synchronous per-user socket counts — avoids refresh races with async fetchSockets(). */

const socketsByUser = new Map<string, Set<string>>();

export function registerUserSocket(userId: string, socketId: string): void {
  let set = socketsByUser.get(userId);
  if (!set) {
    set = new Set();
    socketsByUser.set(userId, set);
  }
  set.add(socketId);
}

export function unregisterUserSocket(userId: string, socketId: string): boolean {
  const set = socketsByUser.get(userId);
  if (!set) return true;
  set.delete(socketId);
  if (set.size === 0) {
    socketsByUser.delete(userId);
    return true;
  }
  return false;
}

/** True when the user still has at least one live Socket.IO connection. */
export function userHasLiveSockets(userId: string): boolean {
  const set = socketsByUser.get(userId);
  return !!set && set.size > 0;
}
