import type { Server, Socket } from "socket.io";
import { SOCKET_EVENTS } from "@linkr/shared";
import type {
  CallIncomingPayload,
  CallInitiatePayload,
  CallSignalPayload,
  PublicUser,
  WebRtcIceCandidatePayload,
  WebRtcSdpPayload,
} from "@linkr/shared";
import { logger } from "../utils/logger.js";
import { UserModel } from "../models/User.js";
import { areFriends } from "../modules/friends/friendship.helpers.js";
import { getChatForUser, getOtherMemberId } from "../modules/chat/chat.service.js";
import { requireSocketUser } from "./auth.socket.js";

/**
 * Live call bookkeeping (in-memory, per process). 1:1 only. We track who's in a call so we can:
 *  - reject a 3rd-party call to a busy user (CALL_BUSY), and
 *  - tell the peer the call ended if a participant disconnects.
 * State is intentionally ephemeral — a server restart simply drops in-flight calls.
 */
interface CallParticipants {
  caller: string;
  callee: string;
  chatId: string;
}
const callsById = new Map<string, CallParticipants>();
const callsByUser = new Map<string, Set<string>>();

function trackCall(callId: string, parts: CallParticipants): void {
  callsById.set(callId, parts);
  for (const uid of [parts.caller, parts.callee]) {
    let set = callsByUser.get(uid);
    if (!set) {
      set = new Set();
      callsByUser.set(uid, set);
    }
    set.add(callId);
  }
}

function untrackCall(callId: string): CallParticipants | undefined {
  const parts = callsById.get(callId);
  if (!parts) return undefined;
  callsById.delete(callId);
  for (const uid of [parts.caller, parts.callee]) {
    const set = callsByUser.get(uid);
    set?.delete(callId);
    if (set && set.size === 0) callsByUser.delete(uid);
  }
  return parts;
}

function isBusy(userId: string): boolean {
  const set = callsByUser.get(userId);
  return !!set && set.size > 0;
}

/**
 * Resolve the peer for a chat and re-check the accepted friendship (blueprint §5). Returns the
 * other member's id, or null when the caller isn't a member or the two aren't friends. Self-chats
 * have no peer, so calling is not allowed there either.
 */
async function resolvePeer(userId: string, chatId: string): Promise<string | null> {
  try {
    const chat = await getChatForUser(chatId, userId);
    const otherId = await getOtherMemberId(chat, userId);
    if (!otherId || otherId === userId) return null;
    if (!(await areFriends(userId, otherId))) return null;
    return otherId;
  } catch {
    return null;
  }
}

export function registerCallHandlers(io: Server, socket: Socket): void {
  const userId = requireSocketUser(socket);
  if (!userId) return;

  type Ack = (res?: { ok: boolean; reason?: string }) => void;

  socket.on(
    SOCKET_EVENTS.CALL_INITIATE,
    async (payload: CallInitiatePayload, ack?: Ack) => {
      try {
        const { callId, chatId, media } = payload ?? {};
        if (!callId || !chatId || (media !== "audio" && media !== "video")) {
          ack?.({ ok: false, reason: "INVALID" });
          return;
        }

        const peerId = await resolvePeer(userId, chatId);
        if (!peerId) {
          ack?.({ ok: false, reason: "NOT_ALLOWED" });
          return;
        }

        if (isBusy(peerId)) {
          ack?.({ ok: false, reason: "BUSY" });
          return;
        }

        // Is the callee connected on any device?
        const peerSockets = await io.in(`user:${peerId}`).fetchSockets();
        if (peerSockets.length === 0) {
          ack?.({ ok: false, reason: "UNAVAILABLE" });
          return;
        }

        const caller = await UserModel.findById(userId).select("username displayName avatar");
        if (!caller) {
          ack?.({ ok: false, reason: "NOT_ALLOWED" });
          return;
        }

        const from: PublicUser = {
          _id: userId,
          username: caller.username ?? undefined,
          displayName: caller.displayName,
          avatar: caller.avatar ?? undefined,
        };

        trackCall(callId, { caller: userId, callee: peerId, chatId });

        const incoming: CallIncomingPayload = { callId, chatId, media, from };
        io.to(`user:${peerId}`).emit(SOCKET_EVENTS.CALL_INCOMING, incoming);
        ack?.({ ok: true });
      } catch (err) {
        logger.warn("call:initiate failed", {
          userId,
          err: err instanceof Error ? err.message : String(err),
        });
        ack?.({ ok: false, reason: "ERROR" });
      }
    },
  );

  // Relay a simple control message (accept/reject/end) to the OTHER participant of the call.
  const relayControl = async (event: string, payload: CallSignalPayload, endCall: boolean) => {
    try {
      const { callId, chatId } = payload ?? {};
      if (!callId || !chatId) return;
      const peerId = await resolvePeer(userId, chatId);
      if (!peerId) return;
      io.to(`user:${peerId}`).emit(event, { callId, chatId } satisfies CallSignalPayload);
      if (endCall) untrackCall(callId);
    } catch {
      /* ignore */
    }
  };

  socket.on(SOCKET_EVENTS.CALL_ACCEPT, (payload: CallSignalPayload) =>
    relayControl(SOCKET_EVENTS.CALL_ACCEPT, payload, false),
  );
  socket.on(SOCKET_EVENTS.CALL_REJECT, (payload: CallSignalPayload) =>
    relayControl(SOCKET_EVENTS.CALL_REJECT, payload, true),
  );
  socket.on(SOCKET_EVENTS.CALL_END, (payload: CallSignalPayload) =>
    relayControl(SOCKET_EVENTS.CALL_END, payload, true),
  );

  // WebRTC handshake — relayed verbatim. Friendship is re-checked on every hop.
  socket.on(SOCKET_EVENTS.WEBRTC_OFFER, async (payload: WebRtcSdpPayload) => {
    const peerId = payload?.chatId ? await resolvePeer(userId, payload.chatId) : null;
    if (peerId) io.to(`user:${peerId}`).emit(SOCKET_EVENTS.WEBRTC_OFFER, payload);
  });
  socket.on(SOCKET_EVENTS.WEBRTC_ANSWER, async (payload: WebRtcSdpPayload) => {
    const peerId = payload?.chatId ? await resolvePeer(userId, payload.chatId) : null;
    if (peerId) io.to(`user:${peerId}`).emit(SOCKET_EVENTS.WEBRTC_ANSWER, payload);
  });
  socket.on(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, async (payload: WebRtcIceCandidatePayload) => {
    const peerId = payload?.chatId ? await resolvePeer(userId, payload.chatId) : null;
    if (peerId) io.to(`user:${peerId}`).emit(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, payload);
  });

  // If a participant fully disconnects (no other device left), tell the peer the call ended and
  // clean up any of their live calls. `disconnect` fires AFTER the socket has left its rooms, so a
  // remaining socket means another tab/device is still connected — don't tear the call down then.
  socket.on("disconnect", () => {
    void (async () => {
      const set = callsByUser.get(userId);
      if (!set || set.size === 0) return;
      const remaining = await io.in(`user:${userId}`).fetchSockets();
      if (remaining.length > 0) return;

      for (const callId of [...set]) {
        const parts = untrackCall(callId);
        if (!parts) continue;
        const peerId = parts.caller === userId ? parts.callee : parts.caller;
        io.to(`user:${peerId}`).emit(SOCKET_EVENTS.CALL_END, {
          callId,
          chatId: parts.chatId,
        } satisfies CallSignalPayload);
      }
    })();
  });
}
