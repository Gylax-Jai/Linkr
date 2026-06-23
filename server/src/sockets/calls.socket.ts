import type { Server, Socket } from "socket.io";
import { SOCKET_EVENTS } from "@linkr/shared";
import type {
  CallIncomingPayload,
  CallInitiateAck,
  CallInitiatePayload,
  CallMedia,
  CallOutcome,
  CallSignalPayload,
  PublicUser,
  WebRtcIceCandidatePayload,
  WebRtcSdpPayload,
} from "@linkr/shared";
import { logger } from "../utils/logger.js";
import { UserModel } from "../models/User.js";
import { areFriends } from "../modules/friends/friendship.helpers.js";
import {
  createCallLogMessage,
  getChatForUser,
  getOtherMemberId,
} from "../modules/chat/chat.service.js";
import { requireSocketUser } from "./auth.socket.js";

/** How long an unanswered call rings before it's marked missed (WhatsApp-like). */
const RING_TIMEOUT_MS = 35_000;

/**
 * Live call bookkeeping (in-memory, per process). 1:1 only. We track who's in a call so we can:
 *  - reject a 3rd-party call to a busy user (CALL_BUSY),
 *  - tell the peer the call ended if a participant disconnects,
 *  - time out an unanswered call, and
 *  - write the correct call-log row (completed/missed/declined/cancelled) when it ends.
 * State is intentionally ephemeral — a server restart simply drops in-flight calls.
 */
interface CallRecord {
  caller: string;
  callee: string;
  chatId: string;
  media: CallMedia;
  /** Set when the callee accepts — its presence means the call connected (drives duration). */
  acceptedAt?: number;
  /** Ring-timeout handle; cleared on accept/reject/end. */
  ringTimeout?: ReturnType<typeof setTimeout>;
}
const callsById = new Map<string, CallRecord>();
const callsByUser = new Map<string, Set<string>>();

function trackCall(callId: string, parts: CallRecord): void {
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

function untrackCall(callId: string): CallRecord | undefined {
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
 * End a tracked call exactly once: clear its timer, stop tracking it, and persist a call-log row.
 * Idempotent — a second call for the same id (e.g. both peers hang up) is a no-op. The duration is
 * computed from `acceptedAt` only for completed calls.
 */
function finalizeCall(callId: string | undefined, outcome: CallOutcome): void {
  if (!callId) return;
  const parts = untrackCall(callId);
  if (!parts) return;
  if (parts.ringTimeout) clearTimeout(parts.ringTimeout);

  const durationSec =
    outcome === "completed" && parts.acceptedAt
      ? Math.max(0, Math.round((Date.now() - parts.acceptedAt) / 1000))
      : undefined;

  void createCallLogMessage(parts.chatId, parts.caller, {
    media: parts.media,
    outcome,
    ...(durationSec !== undefined ? { durationSec } : {}),
  });
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

  type Ack = (res?: CallInitiateAck) => void;

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

        const caller = await UserModel.findById(userId).select("username displayName avatar");
        if (!caller) {
          ack?.({ ok: false, reason: "NOT_ALLOWED" });
          return;
        }

        // Is the callee connected on any device? If so it rings now; if not, the caller still
        // gets a "Calling…" state and the call rings out into a missed-call log after the timeout.
        const peerSockets = await io.in(`user:${peerId}`).fetchSockets();
        const peerOnline = peerSockets.length > 0;

        const record: CallRecord = { caller: userId, callee: peerId, chatId, media };
        trackCall(callId, record);

        if (peerOnline) {
          const from: PublicUser = {
            _id: userId,
            username: caller.username ?? undefined,
            displayName: caller.displayName,
            avatar: caller.avatar ?? undefined,
          };
          const incoming: CallIncomingPayload = { callId, chatId, media, from };
          io.to(`user:${peerId}`).emit(SOCKET_EVENTS.CALL_INCOMING, incoming);
        }

        // Ring-out → missed. Tell both ends the call ended, then write the missed-call log.
        record.ringTimeout = setTimeout(() => {
          io.to(`user:${record.caller}`).emit(SOCKET_EVENTS.CALL_END, { callId, chatId });
          io.to(`user:${record.callee}`).emit(SOCKET_EVENTS.CALL_END, { callId, chatId });
          finalizeCall(callId, "missed");
        }, RING_TIMEOUT_MS);

        ack?.({ ok: true, ringing: peerOnline });
      } catch (err) {
        logger.warn("call:initiate failed", {
          userId,
          err: err instanceof Error ? err.message : String(err),
        });
        ack?.({ ok: false, reason: "ERROR" });
      }
    },
  );

  // Relay a control message to the OTHER participant. Friendship is re-checked on every hop.
  const relayToPeer = async (event: string, payload: CallSignalPayload): Promise<void> => {
    const { callId, chatId } = payload ?? {};
    if (!callId || !chatId) return;
    const peerId = await resolvePeer(userId, chatId);
    if (peerId) io.to(`user:${peerId}`).emit(event, { callId, chatId } satisfies CallSignalPayload);
  };

  // Callee accepted → mark the call connected (stops the ring timer) and tell the caller to offer.
  socket.on(SOCKET_EVENTS.CALL_ACCEPT, (payload: CallSignalPayload) => {
    void (async () => {
      const record = payload?.callId ? callsById.get(payload.callId) : undefined;
      if (record && !record.acceptedAt) {
        record.acceptedAt = Date.now();
        if (record.ringTimeout) clearTimeout(record.ringTimeout);
      }
      await relayToPeer(SOCKET_EVENTS.CALL_ACCEPT, payload);
    })();
  });

  // Callee declined → relay, then log a declined call.
  socket.on(SOCKET_EVENTS.CALL_REJECT, (payload: CallSignalPayload) => {
    void (async () => {
      await relayToPeer(SOCKET_EVENTS.CALL_REJECT, payload);
      finalizeCall(payload?.callId, "declined");
    })();
  });

  // Hang up → relay, then log completed (if it had connected) or cancelled (rang, never answered).
  socket.on(SOCKET_EVENTS.CALL_END, (payload: CallSignalPayload) => {
    void (async () => {
      await relayToPeer(SOCKET_EVENTS.CALL_END, payload);
      const record = payload?.callId ? callsById.get(payload.callId) : undefined;
      finalizeCall(payload?.callId, record?.acceptedAt ? "completed" : "cancelled");
    })();
  });

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
        const parts = callsById.get(callId);
        if (!parts) continue;
        const peerId = parts.caller === userId ? parts.callee : parts.caller;
        io.to(`user:${peerId}`).emit(SOCKET_EVENTS.CALL_END, {
          callId,
          chatId: parts.chatId,
        } satisfies CallSignalPayload);
        // Connected → completed; dropped while still ringing → missed.
        finalizeCall(callId, parts.acceptedAt ? "completed" : "missed");
      }
    })();
  });
}
