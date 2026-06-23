import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { SOCKET_EVENTS } from "@linkr/shared";
import type {
  CallIncomingPayload,
  CallMedia,
  CallSignalPayload,
  PublicUser,
  WebRtcIceCandidatePayload,
  WebRtcSdpPayload,
} from "@linkr/shared";
import { getSocket } from "@/lib/socket/client";
import { useAuthStore, useCallStore } from "@/lib/store";
import type { CallEndReason } from "@/lib/store";
import { CallEngine } from "./CallEngine";
import { fetchIceConfig } from "./useIceConfig";
import { CallOverlay } from "./CallOverlay";
import { IncomingCallModal } from "./IncomingCallModal";

interface CallActions {
  startCall: (args: { chatId: string; peer: PublicUser; media?: CallMedia }) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  hangUp: () => void;
  toggleMute: () => void;
}

const CallActionsContext = createContext<CallActions | null>(null);

/** Hook for call controls (start/accept/reject/hang-up/mute). Must be used under CallProvider. */
export function useCallActions(): CallActions {
  const ctx = useContext(CallActionsContext);
  if (!ctx) throw new Error("useCallActions must be used within CallProvider");
  return ctx;
}

/**
 * Orchestrates the call lifecycle: maps Socket.IO signaling to the WebRTC CallEngine and the
 * call store. One active call at a time. Friendship + routing are enforced server-side; this
 * provider only drives the local state machine and media.
 */
export function CallProvider({ children }: { children: React.ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const accessToken = useAuthStore((s) => s.accessToken);

  const engineRef = useRef<CallEngine | null>(null);
  const endTimerRef = useRef<number | null>(null);
  // Buffer signaling that can arrive before the engine exists (offer / early ICE candidates).
  const pendingOfferRef = useRef<WebRtcSdpPayload | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);

  const actions = useMemo<CallActions>(() => {
    const emit = (event: string, payload: unknown) => getSocket()?.emit(event, payload);

    const teardown = (reason: CallEndReason) => {
      engineRef.current?.close();
      engineRef.current = null;
      pendingOfferRef.current = null;
      pendingIceRef.current = [];
      useCallStore.getState().endCall(reason);
      if (endTimerRef.current) window.clearTimeout(endTimerRef.current);
      // Briefly show the end state, then return to idle.
      endTimerRef.current = window.setTimeout(() => useCallStore.getState().reset(), 1400);
    };

    // Wire engine callbacks for the current call (caller + callee share this).
    const makeEngine = async (media: CallMedia): Promise<CallEngine> => {
      const iceServers = await fetchIceConfig();
      const { callId, chatId } = useCallStore.getState();
      const engine = new CallEngine(iceServers, media, {
        onIceCandidate: (candidate) =>
          emit(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, { callId, chatId, candidate } as WebRtcIceCandidatePayload),
        onConnectionStateChange: (state) => {
          useCallStore.getState().setConnection(state);
          if (state === "connected") useCallStore.getState().setActive();
          if (state === "failed") teardown("failed");
        },
        onRemoteStream: () => useCallStore.getState().setActive(),
      });
      await engine.startLocalMedia();
      engineRef.current = engine;
      // Apply the saved mute preference, then flush any buffered remote signaling.
      engine.setMuted(useCallStore.getState().muted);
      for (const c of pendingIceRef.current) void engine.addIceCandidate(c);
      pendingIceRef.current = [];
      return engine;
    };

    const startCall: CallActions["startCall"] = ({ chatId, peer, media = "audio" }) => {
      if (useCallStore.getState().phase !== "idle") return;
      const callId = crypto.randomUUID();
      useCallStore.getState().startOutgoing({ callId, chatId, media, peer });

      getSocket()?.emit(
        SOCKET_EVENTS.CALL_INITIATE,
        { callId, chatId, media },
        (res?: { ok: boolean; reason?: string }) => {
          if (res?.ok) return; // Ringing — wait for accept/reject.
          const reason: CallEndReason =
            res?.reason === "BUSY"
              ? "busy"
              : res?.reason === "UNAVAILABLE"
                ? "unavailable"
                : "failed";
          teardown(reason);
        },
      );
    };

    const acceptCall: CallActions["acceptCall"] = () => {
      const { phase, callId, chatId, media } = useCallStore.getState();
      if (phase !== "incoming" || !callId || !chatId) return;
      useCallStore.getState().setConnecting();
      emit(SOCKET_EVENTS.CALL_ACCEPT, { callId, chatId } as CallSignalPayload);

      void (async () => {
        try {
          const engine = await makeEngine(media);
          // The caller's offer may have already arrived while we set up — process it now.
          const offer = pendingOfferRef.current;
          if (offer) {
            pendingOfferRef.current = null;
            await engine.setRemoteDescription(offer.description);
            const answer = await engine.createAnswer();
            emit(SOCKET_EVENTS.WEBRTC_ANSWER, {
              callId,
              chatId,
              description: answer as WebRtcSdpPayload["description"],
            });
          }
        } catch {
          emit(SOCKET_EVENTS.CALL_END, { callId, chatId } as CallSignalPayload);
          teardown("no-mic");
        }
      })();
    };

    const rejectCall: CallActions["rejectCall"] = () => {
      const { callId, chatId } = useCallStore.getState();
      if (callId && chatId) emit(SOCKET_EVENTS.CALL_REJECT, { callId, chatId });
      teardown("rejected");
    };

    const hangUp: CallActions["hangUp"] = () => {
      const { callId, chatId, phase } = useCallStore.getState();
      if (phase === "idle" || phase === "ended") return;
      if (callId && chatId) emit(SOCKET_EVENTS.CALL_END, { callId, chatId });
      teardown("hangup");
    };

    const toggleMute: CallActions["toggleMute"] = () => {
      useCallStore.getState().toggleMute();
      engineRef.current?.setMuted(useCallStore.getState().muted);
    };

    return { startCall, acceptCall, rejectCall, hangUp, toggleMute };
  }, []);

  // Subscribe to call signaling once authenticated. Handlers read fresh state via getState().
  useEffect(() => {
    if (status !== "authed" || !accessToken) return;
    const socket = getSocket();
    if (!socket) return;

    const emit = (event: string, payload: unknown) => socket.emit(event, payload);

    const onIncoming = (payload: CallIncomingPayload) => {
      // Ignore a second incoming call while busy — server already guards, this is belt-and-braces.
      if (useCallStore.getState().phase !== "idle") {
        emit(SOCKET_EVENTS.CALL_REJECT, { callId: payload.callId, chatId: payload.chatId });
        return;
      }
      useCallStore.getState().receiveIncoming({
        callId: payload.callId,
        chatId: payload.chatId,
        media: payload.media,
        peer: payload.from,
      });
    };

    // Callee accepted → caller creates the offer.
    const onAccept = (payload: CallSignalPayload) => {
      const { phase, callId, chatId, media } = useCallStore.getState();
      if (phase !== "outgoing" || payload.callId !== callId || !chatId) return;
      useCallStore.getState().setConnecting();
      void (async () => {
        try {
          const iceServers = await fetchIceConfig();
          const engine = new CallEngine(iceServers, media, {
            onIceCandidate: (candidate) =>
              emit(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, { callId, chatId, candidate }),
            onConnectionStateChange: (state) => {
              useCallStore.getState().setConnection(state);
              if (state === "connected") useCallStore.getState().setActive();
              if (state === "failed") {
                engineRef.current?.close();
                engineRef.current = null;
                useCallStore.getState().endCall("failed");
                window.setTimeout(() => useCallStore.getState().reset(), 1400);
              }
            },
            onRemoteStream: () => useCallStore.getState().setActive(),
          });
          await engine.startLocalMedia();
          engine.setMuted(useCallStore.getState().muted);
          engineRef.current = engine;
          for (const c of pendingIceRef.current) void engine.addIceCandidate(c);
          pendingIceRef.current = [];

          const offer = await engine.createOffer();
          emit(SOCKET_EVENTS.WEBRTC_OFFER, {
            callId,
            chatId,
            description: offer as WebRtcSdpPayload["description"],
          });
        } catch {
          emit(SOCKET_EVENTS.CALL_END, { callId, chatId });
          engineRef.current?.close();
          engineRef.current = null;
          useCallStore.getState().endCall("no-mic");
          window.setTimeout(() => useCallStore.getState().reset(), 1400);
        }
      })();
    };

    // Caller received the answer.
    const onAnswer = (payload: WebRtcSdpPayload) => {
      if (payload.callId !== useCallStore.getState().callId) return;
      void engineRef.current?.setRemoteDescription(payload.description);
    };

    // Callee received the offer (buffer if the engine isn't ready yet).
    const onOffer = (payload: WebRtcSdpPayload) => {
      if (payload.callId !== useCallStore.getState().callId) return;
      const engine = engineRef.current;
      if (!engine) {
        pendingOfferRef.current = payload;
        return;
      }
      void (async () => {
        await engine.setRemoteDescription(payload.description);
        const answer = await engine.createAnswer();
        emit(SOCKET_EVENTS.WEBRTC_ANSWER, {
          callId: payload.callId,
          chatId: payload.chatId,
          description: answer as WebRtcSdpPayload["description"],
        });
      })();
    };

    const onIce = (payload: WebRtcIceCandidatePayload) => {
      if (payload.callId !== useCallStore.getState().callId) return;
      const engine = engineRef.current;
      if (engine) void engine.addIceCandidate(payload.candidate);
      else pendingIceRef.current.push(payload.candidate);
    };

    const finishRemote = (reason: CallEndReason) => (payload: CallSignalPayload) => {
      if (payload.callId !== useCallStore.getState().callId) return;
      engineRef.current?.close();
      engineRef.current = null;
      pendingOfferRef.current = null;
      pendingIceRef.current = [];
      useCallStore.getState().endCall(reason);
      window.setTimeout(() => useCallStore.getState().reset(), 1400);
    };

    const onReject = finishRemote("rejected");
    const onEnd = finishRemote("hangup");

    socket.on(SOCKET_EVENTS.CALL_INCOMING, onIncoming);
    socket.on(SOCKET_EVENTS.CALL_ACCEPT, onAccept);
    socket.on(SOCKET_EVENTS.CALL_REJECT, onReject);
    socket.on(SOCKET_EVENTS.CALL_END, onEnd);
    socket.on(SOCKET_EVENTS.WEBRTC_OFFER, onOffer);
    socket.on(SOCKET_EVENTS.WEBRTC_ANSWER, onAnswer);
    socket.on(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, onIce);

    return () => {
      socket.off(SOCKET_EVENTS.CALL_INCOMING, onIncoming);
      socket.off(SOCKET_EVENTS.CALL_ACCEPT, onAccept);
      socket.off(SOCKET_EVENTS.CALL_REJECT, onReject);
      socket.off(SOCKET_EVENTS.CALL_END, onEnd);
      socket.off(SOCKET_EVENTS.WEBRTC_OFFER, onOffer);
      socket.off(SOCKET_EVENTS.WEBRTC_ANSWER, onAnswer);
      socket.off(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, onIce);
    };
  }, [status, accessToken]);

  return (
    <CallActionsContext.Provider value={actions}>
      {children}
      <IncomingCallModal />
      <CallOverlay />
    </CallActionsContext.Provider>
  );
}
