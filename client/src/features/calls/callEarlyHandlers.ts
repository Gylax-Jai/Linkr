import type { Socket } from "socket.io-client";
import type { CallIncomingPayload, CallSignalPayload } from "@linkr/shared";
import { SOCKET_EVENTS } from "@linkr/shared";
import { useCallStore } from "@/lib/store";
import { callLog } from "./callLog";
import { dispatchCallAccept, dispatchCallRinging } from "./callSignalingRegistry";

/**
 * Registers high-priority call handlers on the socket immediately after connect (Phase 3.1.9–3.1.11).
 * Incoming acks here; accept/ringing dispatch to CallProvider via the signaling registry.
 */
export function attachCallEarlyHandlers(socket: Socket): () => void {
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

  const onRinging = (payload: CallSignalPayload) => {
    callLog("early call:ringing", { callId: payload.callId });
    dispatchCallRinging(payload);
  };

  const onAccept = (payload: CallSignalPayload) => {
    callLog("early call:accept", { callId: payload.callId });
    dispatchCallAccept(payload);
  };

  socket.on(SOCKET_EVENTS.CALL_INCOMING, onIncoming);
  socket.on(SOCKET_EVENTS.CALL_RINGING, onRinging);
  socket.on(SOCKET_EVENTS.CALL_ACCEPT, onAccept);

  return () => {
    socket.off(SOCKET_EVENTS.CALL_INCOMING, onIncoming);
    socket.off(SOCKET_EVENTS.CALL_RINGING, onRinging);
    socket.off(SOCKET_EVENTS.CALL_ACCEPT, onAccept);
  };
}
