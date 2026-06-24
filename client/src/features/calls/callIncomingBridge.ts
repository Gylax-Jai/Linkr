import type { Socket } from "socket.io-client";
import type { CallIncomingPayload } from "@linkr/shared";
import { SOCKET_EVENTS } from "@linkr/shared";
import { useCallStore } from "@/lib/store";

/**
 * Registers `call:incoming` on the socket as early as possible (Phase 3.1.9). CallProvider mounts
 * later and would miss events during the connect → handler race; this bridge acks via
 * `call:incoming-ack` once the store is updated.
 */
export function attachCallIncomingHandler(socket: Socket): () => void {
  const onIncoming = (payload: CallIncomingPayload) => {
    const state = useCallStore.getState();

    if (state.phase !== "idle") {
      if (state.callId === payload.callId && state.phase === "incoming") {
        socket.emit(SOCKET_EVENTS.CALL_INCOMING_ACK, {
          callId: payload.callId,
          chatId: payload.chatId,
          ok: true,
        });
        return;
      }

      if (state.phase === "active" || state.phase === "connecting") {
        socket.emit(SOCKET_EVENTS.CALL_REJECT, { callId: payload.callId, chatId: payload.chatId });
        socket.emit(SOCKET_EVENTS.CALL_INCOMING_ACK, {
          callId: payload.callId,
          chatId: payload.chatId,
          ok: true,
        });
        return;
      }

      useCallStore.getState().reset();
    }

    useCallStore.getState().receiveIncoming({
      callId: payload.callId,
      chatId: payload.chatId,
      media: payload.media,
      peer: payload.from,
    });

    socket.emit(SOCKET_EVENTS.CALL_INCOMING_ACK, {
      callId: payload.callId,
      chatId: payload.chatId,
      ok: true,
    });
  };

  socket.on(SOCKET_EVENTS.CALL_INCOMING, onIncoming);
  return () => socket.off(SOCKET_EVENTS.CALL_INCOMING, onIncoming);
}
