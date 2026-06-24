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
  const ackIncoming = (payload: CallIncomingPayload) => {
    socket.emit(SOCKET_EVENTS.CALL_INCOMING_ACK, {
      callId: payload.callId,
      chatId: payload.chatId,
      ok: true,
    });
  };

  const onIncoming = (payload: CallIncomingPayload) => {
    const state = useCallStore.getState();

    if (state.phase !== "idle") {
      // Same call — duplicate delivery or retry while ringing/connecting (Phase 3.1.10).
      if (state.callId === payload.callId) {
        if (state.phase === "incoming" || state.phase === "connecting") {
          ackIncoming(payload);
          return;
        }
      }

      if (state.phase === "active" || state.phase === "connecting") {
        socket.emit(SOCKET_EVENTS.CALL_REJECT, { callId: payload.callId, chatId: payload.chatId });
        ackIncoming(payload);
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

    ackIncoming(payload);
  };

  socket.on(SOCKET_EVENTS.CALL_INCOMING, onIncoming);
  return () => socket.off(SOCKET_EVENTS.CALL_INCOMING, onIncoming);
}
