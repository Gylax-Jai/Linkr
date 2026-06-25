import type { Server, Socket } from "socket.io";
import { SOCKET_EVENTS } from "@linkr/shared";
import type {
  CallIncomingPayload,
  CallInitiateAck,
  CallInitiatePayload,
  CallMedia,
  CallOutcome,
  CallSignalPayload,
  CallSyncActiveCall,
  CallSyncResponse,
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
import { userHasLiveSockets } from "./socket-registry.js";

/** How long an unanswered call rings before it's marked missed (WhatsApp-like). */
const RING_TIMEOUT_MS = 30_000;
/**
 * Hard cap on a *connected* call (Sprint 3.2.2). The timer starts on CALL_ACCEPT, not on initiate,
 * so ring/setup time never eats into talk time. Real conversations run until someone hangs up; this
 * is only a safety ceiling to clear truly stuck sessions.
 */
const MAX_ACTIVE_CALL_MS = 2 * 60 * 60_000; // 2 hours
/** Grace after ring timeout before pruning unanswered ghost sessions. */
const STALE_RING_GRACE_MS = 5_000;
/** Wait for reconnect before ending calls on last-socket disconnect (Phase 3.1.6). */
const RECONNECT_GRACE_MS = 20_000;
/** Reliable incoming delivery (Phase 3.1.9): emit + wait for explicit `call:incoming-ack`. */
const INCOMING_ACK_WAIT_MS = 2_500;
const INCOMING_RETRY_MS = 2_000;
const INCOMING_MAX_ATTEMPTS = 12;

interface CallRecord {
  caller: string;
  callee: string;
  chatId: string;
  media: CallMedia;
  startedAt: number;
  acceptedAt?: number;
  /** Live socket that initiated the call (Phase 3.1.10 — targets signaling on reconnect). */
  callerSocketId?: string;
  /** Live socket that acked incoming / accepted (Phase 3.1.10). */
  calleeSocketId?: string;
  /** Set once the callee's device acknowledges the incoming event (stops retry; true ringing). */
  delivered?: boolean;
  ringTimeout?: ReturnType<typeof setTimeout>;
  maxTimeout?: ReturnType<typeof setTimeout>;
  /** Last SDP for resync after client refresh (Phase 3.1.6). */
  lastOffer?: WebRtcSdpPayload;
  lastAnswer?: WebRtcSdpPayload;
}

interface PendingIncoming {
  calleeId: string;
  payload: CallIncomingPayload;
  expiresAt: number;
}

const callsById = new Map<string, CallRecord>();
const callsByUser = new Map<string, Set<string>>();
const pendingIncoming = new Map<string, PendingIncoming>();
/** Per-user grace timers when the last socket drops — avoids refresh ghost BUSY. */
const disconnectGraceByUser = new Map<string, ReturnType<typeof setTimeout>>();

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

function clearTimers(parts: CallRecord): void {
  if (parts.ringTimeout) clearTimeout(parts.ringTimeout);
  if (parts.maxTimeout) clearTimeout(parts.maxTimeout);
}

function cancelDisconnectGrace(userId: string): void {
  const t = disconnectGraceByUser.get(userId);
  if (t) {
    clearTimeout(t);
    disconnectGraceByUser.delete(userId);
  }
}

/** Drop ghost sessions that outlived their ring / safety window (fixes phantom BUSY). */
function pruneStaleCalls(): void {
  const now = Date.now();
  for (const [callId, record] of callsById) {
    // Accepted calls are measured from acceptedAt (talk time), not from initiate, so a long ring
    // never shortens the active cap (Sprint 3.2.2).
    if (record.acceptedAt) {
      if (now - record.acceptedAt > MAX_ACTIVE_CALL_MS + STALE_RING_GRACE_MS) {
        clearTimers(record);
        untrackCall(callId);
      }
      continue;
    }
    if (now - record.startedAt > RING_TIMEOUT_MS + STALE_RING_GRACE_MS) {
      clearTimers(record);
      untrackCall(callId);
    }
  }
}

function isBusy(userId: string): boolean {
  pruneStaleCalls();
  const set = callsByUser.get(userId);
  if (!set || set.size === 0) return false;
  // Drop entries whose record was pruned but index lagged.
  for (const callId of [...set]) {
    if (!callsById.has(callId)) set.delete(callId);
  }
  if (set.size === 0) {
    callsByUser.delete(userId);
    return false;
  }
  return true;
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

/** Emit to every live socket for a user (Phase 3.1.10 — room broadcast alone missed events with Redis + churn). */
async function emitToUser(
  io: Server,
  userId: string,
  event: string,
  payload: unknown,
  logMeta?: Record<string, unknown>,
): Promise<string[]> {
  const sockets = await io.in(`user:${userId}`).fetchSockets();
  const socketIds = sockets.map((s) => s.id);
  for (const socketId of socketIds) {
    io.to(socketId).emit(event, payload);
  }
  if (logMeta && socketIds.length > 0) {
    logger.info(logMeta.message as string, { ...logMeta, userId, socketIds, event });
  }
  return socketIds;
}

function endCallForPeer(
  io: Server,
  callId: string,
  record: CallRecord,
  userId: string,
  outcome: CallOutcome,
): void {
  const peerId = record.caller === userId ? record.callee : record.caller;
  const payload = { callId, chatId: record.chatId } satisfies CallSignalPayload;
  void emitToUser(io, peerId, SOCKET_EVENTS.CALL_END, payload, {
    message: "call:end relayed",
    callId,
    peerId,
  });
  finalizeCall(callId, outcome);
}

function finalizeAllUserCalls(io: Server, userId: string): void {
  cancelDisconnectGrace(userId);
  const set = callsByUser.get(userId);
  if (!set || set.size === 0) return;

  for (const callId of [...set]) {
    const parts = callsById.get(callId);
    if (!parts) continue;
    const outcome: CallOutcome = parts.acceptedAt
      ? "completed"
      : parts.caller === userId
        ? "cancelled"
        : "missed";
    endCallForPeer(io, callId, parts, userId, outcome);
  }
}

/** Replay accept / SDP to a socket that reconnected mid-call (Phase 3.1.10). */
function replaySignalingToSocket(io: Server, userId: string, socketId: string): void {
  const set = callsByUser.get(userId);
  if (!set) return;

  for (const callId of set) {
    const record = callsById.get(callId);
    if (!record?.acceptedAt) continue;

    const signal = { callId, chatId: record.chatId } satisfies CallSignalPayload;

    if (record.caller === userId) {
      io.to(socketId).emit(SOCKET_EVENTS.CALL_ACCEPT, signal);
      if (record.lastOffer) io.to(socketId).emit(SOCKET_EVENTS.WEBRTC_OFFER, record.lastOffer);
      logger.info("call:signaling replay", { callId, userId, socketId, role: "caller" });
    } else if (record.callee === userId) {
      if (record.lastOffer) io.to(socketId).emit(SOCKET_EVENTS.WEBRTC_OFFER, record.lastOffer);
      if (record.lastAnswer) io.to(socketId).emit(SOCKET_EVENTS.WEBRTC_ANSWER, record.lastAnswer);
      logger.info("call:signaling replay", { callId, userId, socketId, role: "callee" });
    }
  }
}

/** Cancel disconnect grace when a user reconnects (Phase 3.1.6). */
export function onUserSocketConnected(io: Server, userId: string, socketId?: string): void {
  cancelDisconnectGrace(userId);
  deliverPendingCalls(io, userId);
  if (socketId) replaySignalingToSocket(io, userId, socketId);
}

/** Schedule call cleanup when the user's last socket disconnects (Phase 3.1.6). */
export function onUserSocketDisconnected(io: Server, userId: string): void {
  cancelDisconnectGrace(userId);
  if (userHasLiveSockets(userId)) return;

  const timer = setTimeout(() => {
    disconnectGraceByUser.delete(userId);
    if (userHasLiveSockets(userId)) return;
    finalizeAllUserCalls(io, userId);
  }, RECONNECT_GRACE_MS);
  disconnectGraceByUser.set(userId, timer);
}

/**
 * Safety ceiling for a *connected* call (Sprint 3.2.2). Started on CALL_ACCEPT — never on initiate —
 * so ring/setup time is excluded and normal calls run until someone hangs up.
 */
function scheduleActiveCallTimeout(io: Server, callId: string, record: CallRecord): void {
  if (record.maxTimeout) clearTimeout(record.maxTimeout);
  record.maxTimeout = setTimeout(() => {
    const rec = callsById.get(callId);
    if (!rec) return;
    const payload = { callId, chatId: rec.chatId } satisfies CallSignalPayload;
    void emitToUser(io, rec.caller, SOCKET_EVENTS.CALL_END, payload);
    void emitToUser(io, rec.callee, SOCKET_EVENTS.CALL_END, payload);
    finalizeCall(callId, "completed");
  }, MAX_ACTIVE_CALL_MS);
}

function scheduleRingTimeout(io: Server, callId: string, record: CallRecord): void {
  record.ringTimeout = setTimeout(() => {
    const rec = callsById.get(callId);
    if (!rec || rec.acceptedAt) return;
    const payload = { callId, chatId: rec.chatId } satisfies CallSignalPayload;
    void emitToUser(io, rec.caller, SOCKET_EVENTS.CALL_END, payload);
    void emitToUser(io, rec.callee, SOCKET_EVENTS.CALL_END, payload);
    finalizeCall(callId, "missed");
  }, RING_TIMEOUT_MS);
}

/**
 * Reliable incoming delivery (Phase 3.1.9). Emits to each live socket id (not Socket.IO server-side
 * ack — that timed out with zero responses under Redis adapter + reconnect churn). Retries until
 * the callee sends `call:incoming-ack` or the call rings out.
 */
function deliverIncomingWithRetry(
  io: Server,
  callId: string,
  peerId: string,
  callerId: string,
  incoming: CallIncomingPayload,
): void {
  void runIncomingDelivery(io, callId, peerId, callerId, incoming, 1);
}

function markIncomingDelivered(
  io: Server,
  callId: string,
  peerId: string,
  calleeSocketId: string,
  attempt?: number,
): void {
  const record = callsById.get(callId);
  if (!record || record.delivered || record.acceptedAt) return;
  record.delivered = true;
  record.calleeSocketId = calleeSocketId;
  void emitToUser(
    io,
    record.caller,
    SOCKET_EVENTS.CALL_RINGING,
    { callId, chatId: record.chatId } satisfies CallSignalPayload,
    { message: "call:ringing relayed", callId, callerId: record.caller },
  );
  logger.info("call:incoming acked", { callId, peerId, calleeSocketId, attempt: attempt ?? null });
}

async function runIncomingDelivery(
  io: Server,
  callId: string,
  peerId: string,
  callerId: string,
  incoming: CallIncomingPayload,
  attempt: number,
): Promise<void> {
  const record = callsById.get(callId);
  if (!record || record.acceptedAt || record.delivered) return;

  const sockets = await io.in(`user:${peerId}`).fetchSockets();
  const socketCount = sockets.length;
  logger.info("call:delivery attempt", {
    callId,
    peerId,
    callerId,
    attempt,
    socketCount,
    registrySockets: userHasLiveSockets(peerId),
  });

  if (socketCount === 0) {
    pendingIncoming.set(callId, {
      calleeId: peerId,
      payload: incoming,
      expiresAt: Date.now() + RING_TIMEOUT_MS,
    });
    logger.info("call:incoming buffered (peer offline)", { callId, peerId, attempt });
    if (attempt < INCOMING_MAX_ATTEMPTS) {
      setTimeout(
        () => void runIncomingDelivery(io, callId, peerId, callerId, incoming, attempt + 1),
        INCOMING_RETRY_MS,
      );
    }
    return;
  }

  pendingIncoming.delete(callId);

  const socketIds = sockets.map((s) => s.id);
  for (const socketId of socketIds) {
    io.to(socketId).emit(SOCKET_EVENTS.CALL_INCOMING, incoming);
  }
  logger.info("call:incoming emitted", { callId, peerId, attempt, socketIds });

  setTimeout(() => {
    const rec = callsById.get(callId);
    if (!rec || rec.acceptedAt || rec.delivered) return;

    if (attempt < INCOMING_MAX_ATTEMPTS) {
      void runIncomingDelivery(io, callId, peerId, callerId, incoming, attempt + 1);
    } else {
      logger.warn("call:incoming not acked after retries", { callId, peerId, attempt });
    }
  }, INCOMING_ACK_WAIT_MS);
}

/** Deliver a call that was initiated while the callee's socket was offline (Phase 4.2 / 3.1.7). */
export function deliverPendingCalls(io: Server, userId: string): void {
  for (const [callId, pending] of pendingIncoming) {
    if (pending.calleeId !== userId) continue;
    if (pending.expiresAt <= Date.now() || !callsById.has(callId)) {
      pendingIncoming.delete(callId);
      continue;
    }
    pendingIncoming.delete(callId);
    const record = callsById.get(callId);
    if (!record || record.acceptedAt) continue;
    deliverIncomingWithRetry(io, callId, pending.calleeId, record.caller, pending.payload);
  }
}

async function resolvePeer(userId: string, chatId: string): Promise<string | null> {
  try {
    const chat = await getChatForUser(chatId, userId);
    if (chat.type === "group") return null;
    const otherId = await getOtherMemberId(chat, userId);
    if (!otherId || otherId === userId) return null;
    if (!(await areFriends(userId, otherId))) return null;
    return otherId;
  } catch {
    return null;
  }
}

async function loadPublicUser(userId: string): Promise<PublicUser | null> {
  const user = await UserModel.findById(userId).select("username displayName avatar");
  if (!user) return null;
  return {
    _id: userId,
    username: user.username ?? undefined,
    displayName: user.displayName,
    avatar: user.avatar ?? undefined,
  };
}

function pickActiveCallForUser(userId: string): { callId: string; record: CallRecord } | null {
  pruneStaleCalls();
  const set = callsByUser.get(userId);
  if (!set || set.size === 0) return null;

  let best: { callId: string; record: CallRecord } | null = null;
  for (const callId of set) {
    const record = callsById.get(callId);
    if (!record) continue;
    if (!best || record.startedAt > best.record.startedAt) {
      best = { callId, record };
    }
  }
  return best;
}

async function buildSyncPayload(
  _io: Server,
  userId: string,
  callId: string,
  record: CallRecord,
): Promise<CallSyncActiveCall | null> {
  const role = record.caller === userId ? "caller" : "callee";
  const peerId = role === "caller" ? record.callee : record.caller;
  const peer = await loadPublicUser(peerId);
  if (!peer) return null;

  const accepted = !!record.acceptedAt;
  let phase: CallSyncActiveCall["phase"];
  if (!accepted) {
    phase = role === "caller" ? "outgoing" : "incoming";
  } else {
    phase = "connecting";
  }

  let ringing: boolean | undefined;
  if (phase === "outgoing") {
    ringing = !!record.delivered;
  } else if (phase === "incoming" && role === "callee") {
    ringing = true;
  }

  const replay: CallSyncActiveCall["replay"] = {};
  if (accepted) replay.accepted = true;
  if (record.lastOffer) replay.offer = record.lastOffer;
  if (record.lastAnswer) replay.answer = record.lastAnswer;

  return {
    callId,
    chatId: record.chatId,
    media: record.media,
    role,
    phase,
    peer,
    ...(ringing !== undefined ? { ringing } : {}),
    ...(Object.keys(replay).length > 0 ? { replay } : {}),
  };
}

/** Drop unanswered outgoing calls for a caller who reconnected idle (Phase 3.1.6 / 3.1.8). */
function clearStaleCallsForUser(io: Server, userId: string): void {
  pruneStaleCalls();
  const set = callsByUser.get(userId);
  if (!set) return;

  for (const callId of [...set]) {
    const record = callsById.get(callId);
    if (!record || record.acceptedAt) continue;
    // Never drop incoming rings for the callee — call:sync should restore those instead.
    if (record.caller !== userId) continue;
    endCallForPeer(io, callId, record, userId, "cancelled");
  }
}

export function registerCallHandlers(io: Server, socket: Socket): void {
  const userId = requireSocketUser(socket);
  if (!userId) return;

  type InitAck = (res?: CallInitiateAck) => void;
  type SyncAck = (res?: CallSyncResponse) => void;

  socket.on(SOCKET_EVENTS.CALL_INCOMING_ACK, (payload: CallSignalPayload) => {
    const { callId } = payload ?? {};
    if (!callId) return;
    const record = callsById.get(callId);
    if (!record || record.callee !== userId || record.delivered || record.acceptedAt) return;
    markIncomingDelivered(io, callId, userId, socket.id);
  });

  socket.on(
    SOCKET_EVENTS.CALL_INITIATE,
    async (payload: CallInitiatePayload, ack?: InitAck) => {
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

        const record: CallRecord = {
          caller: userId,
          callee: peerId,
          chatId,
          media,
          startedAt: Date.now(),
          callerSocketId: socket.id,
        };
        trackCall(callId, record);
        // No active-call cap yet — that starts on CALL_ACCEPT. Until then the ring timeout
        // (scheduleRingTimeout below) governs unanswered calls (Sprint 3.2.2).

        const from: PublicUser = {
          _id: userId,
          username: caller.username ?? undefined,
          displayName: caller.displayName,
          avatar: caller.avatar ?? undefined,
        };
        const incoming: CallIncomingPayload = { callId, chatId, media, from };

        if (peerOnline) {
          deliverIncomingWithRetry(io, callId, peerId, userId, incoming);
        } else {
          pendingIncoming.set(callId, {
            calleeId: peerId,
            payload: incoming,
            expiresAt: Date.now() + RING_TIMEOUT_MS,
          });
        }

        scheduleRingTimeout(io, callId, record);

        logger.info("call:initiate", {
          callId,
          callerId: userId,
          peerId,
          peerOnline,
          callerSocketId: socket.id,
        });
        // True "Ringing…" only after call:ringing (callee acked) — Phase 3.1.8.
        ack?.({ ok: true, ringing: false });
      } catch (err) {
        logger.warn("call:initiate failed", {
          userId,
          err: err instanceof Error ? err.message : String(err),
        });
        ack?.({ ok: false, reason: "ERROR" });
      }
    },
  );

  socket.on(SOCKET_EVENTS.CALL_SYNC, async (_payload: unknown, ack?: SyncAck) => {
    try {
      const active = pickActiveCallForUser(userId);
      if (!active) {
        ack?.({ call: null });
        return;
      }
      const syncCall = await buildSyncPayload(io, userId, active.callId, active.record);
      ack?.({ call: syncCall });
    } catch (err) {
      logger.warn("call:sync failed", {
        userId,
        err: err instanceof Error ? err.message : String(err),
      });
      ack?.({ call: null });
    }
  });

  socket.on(SOCKET_EVENTS.CALL_CLEAR_STALE, () => {
    clearStaleCallsForUser(io, userId);
  });

  const relayToCallPeer = async (
    event: string,
    payload: CallSignalPayload,
    logMessage: string,
  ): Promise<void> => {
    const { callId, chatId } = payload ?? {};
    if (!callId || !chatId) return;

    const record = callsById.get(callId);
    let peerId: string | null = null;
    if (record) {
      peerId = record.caller === userId ? record.callee : record.caller;
    } else {
      peerId = await resolvePeer(userId, chatId);
    }
    if (!peerId) return;

    await emitToUser(io, peerId, event, payload, {
      message: logMessage,
      callId,
      fromUserId: userId,
      peerId,
    });
  };

  socket.on(SOCKET_EVENTS.CALL_ACCEPT, (payload: CallSignalPayload) => {
    void (async () => {
      const record = payload?.callId ? callsById.get(payload.callId) : undefined;
      if (record && !record.acceptedAt) {
        record.acceptedAt = Date.now();
        record.calleeSocketId = socket.id;
        if (record.ringTimeout) clearTimeout(record.ringTimeout);
        record.ringTimeout = undefined;
        pendingIncoming.delete(payload.callId);
        // Start the active-call safety ceiling now (talk time), not from initiate (Sprint 3.2.2).
        scheduleActiveCallTimeout(io, payload.callId, record);
      }
      logger.info("call:accept received", {
        callId: payload?.callId,
        userId,
        socketId: socket.id,
      });
      await relayToCallPeer(SOCKET_EVENTS.CALL_ACCEPT, payload, "call:accept relayed");
    })();
  });

  socket.on(SOCKET_EVENTS.CALL_REJECT, (payload: CallSignalPayload) => {
    void (async () => {
      await relayToCallPeer(SOCKET_EVENTS.CALL_REJECT, payload, "call:reject relayed");
      finalizeCall(payload?.callId, "declined");
    })();
  });

  socket.on(SOCKET_EVENTS.CALL_END, (payload: CallSignalPayload) => {
    void (async () => {
      const record = payload?.callId ? callsById.get(payload.callId) : undefined;
      await relayToCallPeer(SOCKET_EVENTS.CALL_END, payload, "call:end relayed");
      if (!record) return;
      const outcome: CallOutcome = record.acceptedAt
        ? "completed"
        : record.caller === userId
          ? "cancelled"
          : "declined";
      finalizeCall(payload?.callId, outcome);
    })();
  });

  socket.on(SOCKET_EVENTS.WEBRTC_OFFER, async (payload: WebRtcSdpPayload) => {
    logger.info("webrtc:offer received", {
      callId: payload?.callId,
      userId,
      socketId: socket.id,
    });
    if (payload?.callId) {
      const record = callsById.get(payload.callId);
      if (record) {
        record.lastOffer = payload;
        if (record.caller === userId) record.callerSocketId = socket.id;
      }
    }
    const record = payload?.callId ? callsById.get(payload.callId) : undefined;
    const peerId = record
      ? record.caller === userId
        ? record.callee
        : record.caller
      : payload?.chatId
        ? await resolvePeer(userId, payload.chatId)
        : null;
    if (peerId) {
      await emitToUser(io, peerId, SOCKET_EVENTS.WEBRTC_OFFER, payload, {
        message: "webrtc:offer relayed",
        callId: payload.callId,
        fromUserId: userId,
        peerId,
      });
    }
  });

  socket.on(SOCKET_EVENTS.WEBRTC_ANSWER, async (payload: WebRtcSdpPayload) => {
    if (payload?.callId) {
      const record = callsById.get(payload.callId);
      if (record) {
        record.lastAnswer = payload;
        if (record.callee === userId) record.calleeSocketId = socket.id;
      }
    }
    const record = payload?.callId ? callsById.get(payload.callId) : undefined;
    const peerId = record
      ? record.caller === userId
        ? record.callee
        : record.caller
      : payload?.chatId
        ? await resolvePeer(userId, payload.chatId)
        : null;
    if (peerId) {
      await emitToUser(io, peerId, SOCKET_EVENTS.WEBRTC_ANSWER, payload, {
        message: "webrtc:answer relayed",
        callId: payload.callId,
        fromUserId: userId,
        peerId,
      });
    }
  });

  socket.on(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, async (payload: WebRtcIceCandidatePayload) => {
    const record = payload?.callId ? callsById.get(payload.callId) : undefined;
    const peerId = record
      ? record.caller === userId
        ? record.callee
        : record.caller
      : payload?.chatId
        ? await resolvePeer(userId, payload.chatId)
        : null;
    if (peerId) {
      await emitToUser(io, peerId, SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, payload);
    }
  });
}
