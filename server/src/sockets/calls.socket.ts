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
/** Safety TTL — clears ghost in-memory calls that never received CALL_END (Phase 4.2). */
const MAX_CALL_MS = 3 * 60_000;

interface CallRecord {
  caller: string;
  callee: string;
  chatId: string;
  media: CallMedia;
  acceptedAt?: number;
  ringTimeout?: ReturnType<typeof setTimeout>;
  maxTimeout?: ReturnType<typeof setTimeout>;
}

interface PendingIncoming {
  calleeId: string;
  payload: CallIncomingPayload;
  expiresAt: number;
}

const callsById = new Map<string, CallRecord>();
const callsByUser = new Map<string, Set<string>>();
const pendingIncoming = new Map<string, PendingIncoming>();

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
  pendingIncoming.delete(callId);
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

function clearTimers(parts: CallRecord): void {
  if (parts.ringTimeout) clearTimeout(parts.ringTimeout);
  if (parts.maxTimeout) clearTimeout(parts.maxTimeout);
}

function finalizeCall(callId: string | undefined, outcome: CallOutcome): void {
  if (!callId) return;
  const parts = untrackCall(callId);
  if (!parts) return;
  clearTimers(parts);

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

function scheduleSafetyTimeout(io: Server, callId: string, record: CallRecord): void {
  record.maxTimeout = setTimeout(() => {
    if (!callsById.has(callId)) return;
    io.to(`user:${record.caller}`).emit(SOCKET_EVENTS.CALL_END, { callId, chatId: record.chatId });
    io.to(`user:${record.callee}`).emit(SOCKET_EVENTS.CALL_END, { callId, chatId: record.chatId });
    finalizeCall(callId, record.acceptedAt ? "completed" : "missed");
  }, MAX_CALL_MS);
}

/** Deliver a call that was initiated while the callee's socket was offline (Phase 4.2). */
export function deliverPendingCalls(io: Server, userId: string): void {
  for (const [callId, pending] of pendingIncoming) {
    if (pending.calleeId !== userId) continue;
    if (pending.expiresAt <= Date.now() || !callsById.has(callId)) {
      pendingIncoming.delete(callId);
      continue;
    }
    io.to(`user:${userId}`).emit(SOCKET_EVENTS.CALL_INCOMING, pending.payload);
    pendingIncoming.delete(callId);
  }
}

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

        if (isBusy(peerId) || isBusy(userId)) {
          ack?.({ ok: false, reason: "BUSY" });
          return;
        }

        const caller = await UserModel.findById(userId).select("username displayName avatar");
        if (!caller) {
          ack?.({ ok: false, reason: "NOT_ALLOWED" });
          return;
        }

        const peerSockets = await io.in(`user:${peerId}`).fetchSockets();
        const peerOnline = peerSockets.length > 0;

        const record: CallRecord = { caller: userId, callee: peerId, chatId, media };
        trackCall(callId, record);
        scheduleSafetyTimeout(io, callId, record);

        const from: PublicUser = {
          _id: userId,
          username: caller.username ?? undefined,
          displayName: caller.displayName,
          avatar: caller.avatar ?? undefined,
        };
        const incoming: CallIncomingPayload = { callId, chatId, media, from };

        if (peerOnline) {
          io.to(`user:${peerId}`).emit(SOCKET_EVENTS.CALL_INCOMING, incoming);
        } else {
          pendingIncoming.set(callId, {
            calleeId: peerId,
            payload: incoming,
            expiresAt: Date.now() + RING_TIMEOUT_MS,
          });
        }

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

  const relayToPeer = async (event: string, payload: CallSignalPayload): Promise<void> => {
    const { callId, chatId } = payload ?? {};
    if (!callId || !chatId) return;
    const peerId = await resolvePeer(userId, chatId);
    if (peerId) io.to(`user:${peerId}`).emit(event, { callId, chatId } satisfies CallSignalPayload);
  };

  socket.on(SOCKET_EVENTS.CALL_ACCEPT, (payload: CallSignalPayload) => {
    void (async () => {
      const record = payload?.callId ? callsById.get(payload.callId) : undefined;
      if (record && !record.acceptedAt) {
        record.acceptedAt = Date.now();
        if (record.ringTimeout) clearTimeout(record.ringTimeout);
        pendingIncoming.delete(payload.callId);
      }
      await relayToPeer(SOCKET_EVENTS.CALL_ACCEPT, payload);
    })();
  });

  socket.on(SOCKET_EVENTS.CALL_REJECT, (payload: CallSignalPayload) => {
    void (async () => {
      await relayToPeer(SOCKET_EVENTS.CALL_REJECT, payload);
      finalizeCall(payload?.callId, "declined");
    })();
  });

  socket.on(SOCKET_EVENTS.CALL_END, (payload: CallSignalPayload) => {
    void (async () => {
      await relayToPeer(SOCKET_EVENTS.CALL_END, payload);
      const record = payload?.callId ? callsById.get(payload.callId) : undefined;
      finalizeCall(payload?.callId, record?.acceptedAt ? "completed" : "cancelled");
    })();
  });

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
        finalizeCall(callId, parts.acceptedAt ? "completed" : "missed");
      }
    })();
  });
}
