import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { SOCKET_EVENTS } from "@linkr/shared";
import type {
  CallIncomingPayload,
  CallInitiateAck,
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
import { startCallTone, stopCallTone, playEndTone } from "./callSounds";
import { listAudioRoutes, nextRoute, pickPreferredRoute, type AudioRoute } from "./audioRoute";
import { CallOverlay } from "./CallOverlay";
import { CallBar } from "./CallBar";
import { IncomingCallModal } from "./IncomingCallModal";

interface CallActions {
  startCall: (args: { chatId: string; peer: PublicUser; media?: CallMedia }) => void;
  acceptCall: () => void;
  rejectCall: () => void;
  hangUp: () => void;
  toggleMute: () => void;
  /** Cycle call audio through the available outputs (bluetooth → headset → speaker → …). */
  cycleAudioRoute: () => void;
  /** Switch call audio to a specific output device (from the route dropdown). */
  selectAudioRoute: (deviceId: string) => void;
  minimize: () => void;
  expand: () => void;
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
  // Audio-output routes available on this device (re-scanned on connect + device changes).
  const routesRef = useRef<AudioRoute[]>([]);

  const actions = useMemo<CallActions>(() => {
    const emit = (event: string, payload: unknown) => getSocket()?.emit(event, payload);

    const teardown = (reason: CallEndReason) => {
      engineRef.current?.close();
      engineRef.current = null;
      pendingOfferRef.current = null;
      pendingIceRef.current = [];
      routesRef.current = [];
      useCallStore.getState().endCall(reason);
      if (endTimerRef.current) window.clearTimeout(endTimerRef.current);
      // Briefly show the end state, then return to idle.
      endTimerRef.current = window.setTimeout(() => useCallStore.getState().reset(), 1400);
    };

    /** Apply a route to the engine + reflect it in the store. */
    const applyRoute = (route: AudioRoute) => {
      useCallStore.getState().setAudioRoute(route.kind, route.deviceId);
      void engineRef.current?.setSinkId(route.deviceId);
    };

    /**
     * Re-scan output devices, publish them to the store, and (re)apply the best route. Called once
     * media is live and again whenever devices change (e.g. Bluetooth connects mid-call). Keeps the
     * user's current route if it's still available; otherwise auto-picks the preferred one.
     */
    const refreshRoutes = async () => {
      const routes = await listAudioRoutes();
      routesRef.current = routes;
      useCallStore.getState().setAvailableRoutes(routes);
      const { audioDeviceId, audioRoute } = useCallStore.getState();
      const stillThere = routes.find((r) => r.deviceId === audioDeviceId) ?? routes.find((r) => r.kind === audioRoute);
      applyRoute(stillThere ?? pickPreferredRoute(routes));
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
      // Apply mute, scan + apply the audio route, then flush any buffered remote signaling.
      engine.setMuted(useCallStore.getState().muted);
      void refreshRoutes();
      for (const c of pendingIceRef.current) void engine.addIceCandidate(c);
      pendingIceRef.current = [];
      return engine;
    };

    const startCall: CallActions["startCall"] = ({ chatId, peer, media = "audio" }) => {
      if (useCallStore.getState().phase !== "idle") return;
      const callId = crypto.randomUUID();
      useCallStore.getState().startOutgoing({ callId, chatId, media, peer });

      // Scan audio routes early so the route button is meaningful while ringing.
      void refreshRoutes();

      getSocket()?.emit(
        SOCKET_EVENTS.CALL_INITIATE,
        { callId, chatId, media },
        (res?: CallInitiateAck) => {
          if (res?.ok) {
            // ringing=true → callee device is live ("Ringing…"); false → offline ("Calling…").
            useCallStore.getState().setRinging(Boolean(res.ringing));
            return;
          }
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

    const cycleAudioRoute: CallActions["cycleAudioRoute"] = () => {
      const routes = routesRef.current;
      if (routes.length <= 1) return;
      applyRoute(nextRoute(routes, useCallStore.getState().audioRoute));
    };

    const selectAudioRoute: CallActions["selectAudioRoute"] = (deviceId) => {
      const route = routesRef.current.find((r) => r.deviceId === deviceId);
      if (route) applyRoute(route);
    };

    const minimize: CallActions["minimize"] = () => useCallStore.getState().minimize();
    const expand: CallActions["expand"] = () => useCallStore.getState().expand();

    return {
      startCall,
      acceptCall,
      rejectCall,
      hangUp,
      toggleMute,
      cycleAudioRoute,
      selectAudioRoute,
      minimize,
      expand,
    };
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
          // Scan + apply the audio route now that media is live.
          void (async () => {
            const routes = await listAudioRoutes();
            routesRef.current = routes;
            useCallStore.getState().setAvailableRoutes(routes);
            const { audioDeviceId, audioRoute } = useCallStore.getState();
            const route =
              routes.find((r) => r.deviceId === audioDeviceId) ??
              routes.find((r) => r.kind === audioRoute) ??
              pickPreferredRoute(routes);
            useCallStore.getState().setAudioRoute(route.kind, route.deviceId);
            void engine.setSinkId(route.deviceId);
          })();
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

  // Re-scan audio routes when devices change mid-call (e.g. Bluetooth earbuds connect). Keeps the
  // current route if still present, otherwise auto-picks the new preferred one.
  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    const onChange = () => {
      if (!engineRef.current) return;
      void (async () => {
        const routes = await listAudioRoutes();
        routesRef.current = routes;
        useCallStore.getState().setAvailableRoutes(routes);
        // A new peripheral (e.g. Bluetooth) auto-wins; otherwise keep the user's chosen device.
        const { audioDeviceId } = useCallStore.getState();
        const stillThere = routes.find((r) => r.deviceId === audioDeviceId && r.deviceId);
        const route = stillThere ?? pickPreferredRoute(routes);
        useCallStore.getState().setAudioRoute(route.kind, route.deviceId);
        void engineRef.current?.setSinkId(route.deviceId);
      })();
    };
    md.addEventListener("devicechange", onChange);
    return () => md.removeEventListener("devicechange", onChange);
  }, []);

  return (
    <CallActionsContext.Provider value={actions}>
      {children}
      <CallSounds />
      <IncomingCallModal />
      <CallBar />
      <CallOverlay />
    </CallActionsContext.Provider>
  );
}

/**
 * Drives call audio cues off the phase machine: ringback while the caller waits, ringtone for an
 * incoming call, and a short blip when a call ends. Renders nothing.
 */
function CallSounds() {
  const phase = useCallStore((s) => s.phase);
  const direction = useCallStore((s) => s.direction);

  useEffect(() => {
    if (phase === "outgoing") {
      startCallTone("ringback");
    } else if (phase === "incoming") {
      startCallTone("ringtone");
    } else {
      // connecting / active / idle — silence the waiting tones.
      stopCallTone();
      if (phase === "ended") playEndTone();
    }
    return () => {
      // Safety: ensure tones never leak across phase changes.
      if (phase === "outgoing" || phase === "incoming") stopCallTone();
    };
  }, [phase, direction]);

  return null;
}
