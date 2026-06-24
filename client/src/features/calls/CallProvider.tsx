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
import { startCallTone, stopCallTone, playEndTone, setCallToneSink, resetCallToneSink } from "./callSounds";
import { audioConstraints } from "./callConfig";
import {
  listAudioRoutes,
  nextRoute,
  pickPreferredRoute,
  findRoute,
  resolveSinkCandidates,
  supportsSetSinkId,
  isLogicalRouteId,
  type AudioRoute,
} from "./audioRoute";
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
  // Caller's mic captured early (during "Calling…") to unlock device labels so the audio-route icon
  // is correct before connect; adopted by the engine on accept, or stopped on teardown.
  const earlyStreamRef = useRef<MediaStream | null>(null);
  // Audio-output routes available on this device (re-scanned on connect + device changes).
  const routesRef = useRef<AudioRoute[]>([]);
  const noticeTimerRef = useRef<number | null>(null);
  /** Lets socket/devicechange handlers call the latest route helpers from useMemo. */
  const routeHelpersRef = useRef<{
    refreshRoutes: (opts?: { initial?: boolean; deviceChange?: boolean }) => Promise<void>;
    applyRoute: (route: AudioRoute, opts?: { forceStore?: boolean; userInitiated?: boolean }) => void;
  }>({
    refreshRoutes: async () => {},
    applyRoute: () => {},
  });

  type MediaDevicesWithPicker = MediaDevices & {
    selectAudioOutput?: (options?: { deviceId?: string }) => Promise<MediaDeviceInfo>;
  };

  const actions = useMemo<CallActions>(() => {
    const emit = (event: string, payload: unknown) => getSocket()?.emit(event, payload);

    const teardown = (reason: CallEndReason) => {
      engineRef.current?.close();
      engineRef.current = null;
      pendingOfferRef.current = null;
      pendingIceRef.current = [];
      routesRef.current = [];
      resetCallToneSink();
      // Release the early mic stream if it was never adopted by an engine.
      earlyStreamRef.current?.getTracks().forEach((t) => t.stop());
      earlyStreamRef.current = null;
      useCallStore.getState().endCall(reason);
      if (endTimerRef.current) window.clearTimeout(endTimerRef.current);
      // Briefly show the end state, then return to idle.
      endTimerRef.current = window.setTimeout(() => useCallStore.getState().reset(), 1400);
    };

    /** Apply output route — store updates only after setSinkId succeeds (desktop). */
    const applyRoute = (route: AudioRoute, opts?: { forceStore?: boolean; userInitiated?: boolean }) => {
      void (async () => {
        let target = route;
        const candidates = await resolveSinkCandidates(route);
        let applied = false;

        const engine = engineRef.current;
        if (engine && supportsSetSinkId()) {
          applied = await engine.applyOutputRoute(candidates);
          if (!applied && opts?.userInitiated) {
            const md = navigator.mediaDevices as MediaDevicesWithPicker;
            if (typeof md.selectAudioOutput === "function") {
              try {
                const pickOpts = !isLogicalRouteId(route.deviceId) ? { deviceId: route.deviceId } : undefined;
                const picked = await md.selectAudioOutput(pickOpts);
                applied = await engine.applyOutputRoute([picked.deviceId]);
                if (applied) target = { ...route, deviceId: picked.deviceId, label: picked.label || route.label };
              } catch {
                /* user dismissed browser picker */
              }
            }
          }
        }

        const sinkForTones = engine?.getActiveSinkId() || candidates[0] || route.deviceId;
        if (supportsSetSinkId() && sinkForTones && !isLogicalRouteId(sinkForTones)) {
          const toneOk = await setCallToneSink(sinkForTones);
          applied = applied || toneOk;
        }

        if (applied || opts?.forceStore || !supportsSetSinkId()) {
          useCallStore.getState().setAudioRoute(target.kind, target.deviceId);
        } else if (opts?.userInitiated) {
          showNotice("Couldn't switch audio output. Try again or use the browser device picker.");
        }
      })();
    };

    const showNotice = (message: string) => {
      useCallStore.getState().setCallNotice(message);
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = window.setTimeout(() => useCallStore.getState().setCallNotice(null), 4500);
    };

    /**
     * Re-scan routes and update the dropdown. On first connect picks Earpiece (or BT if connected).
     * On devicechange auto-switches to/from Bluetooth; otherwise keeps the user's choice.
     */
    const refreshRoutes = async (opts?: { initial?: boolean; deviceChange?: boolean }) => {
      const routes = await listAudioRoutes();
      routesRef.current = routes;
      useCallStore.getState().setAvailableRoutes(routes);

      const { audioRoute } = useCallStore.getState();
      const hasBt = routes.some((r) => r.kind === "bluetooth");
      const wasBt = audioRoute === "bluetooth";

      if (opts?.deviceChange && hasBt && !wasBt) {
        const bt = routes.find((r) => r.kind === "bluetooth");
        if (bt) applyRoute(bt, { forceStore: true });
        return;
      }
      if (opts?.deviceChange && !hasBt && wasBt) {
        applyRoute(routes.find((r) => r.kind === "earpiece") ?? pickPreferredRoute(routes), { forceStore: true });
        return;
      }
      if (opts?.initial) {
        applyRoute(pickPreferredRoute(routes), { forceStore: true });
        return;
      }

      const { audioDeviceId } = useCallStore.getState();
      const stillThere =
        findRoute(routes, audioDeviceId) ?? routes.find((r) => r.kind === audioRoute);
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
      void refreshRoutes({ initial: !useCallStore.getState().audioDeviceId });
      for (const c of pendingIceRef.current) void engine.addIceCandidate(c);
      pendingIceRef.current = [];
      return engine;
    };

    const startCall: CallActions["startCall"] = ({ chatId, peer, media = "audio" }) => {
      if (useCallStore.getState().phase !== "idle") return;

      void (async () => {
        // Mic permission MUST succeed before the call starts — no ringback/signaling until allowed.
        try {
          earlyStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        } catch {
          showNotice("Microphone access is required to place a call.");
          return;
        }

        const callId = crypto.randomUUID();
        useCallStore.getState().startOutgoing({ callId, chatId, media, peer });
        await refreshRoutes({ initial: true });

        getSocket()?.emit(
          SOCKET_EVENTS.CALL_INITIATE,
          { callId, chatId, media },
          (res?: CallInitiateAck) => {
            if (res?.ok) {
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
      })();
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
      applyRoute(nextRoute(routes, useCallStore.getState().audioRoute), { userInitiated: true });
    };

    const selectAudioRoute: CallActions["selectAudioRoute"] = (deviceIdOrKind) => {
      const route = findRoute(routesRef.current, deviceIdOrKind);
      if (route) applyRoute(route, { userInitiated: true });
    };

    const minimize: CallActions["minimize"] = () => useCallStore.getState().minimize();
    const expand: CallActions["expand"] = () => useCallStore.getState().expand();

    routeHelpersRef.current = { refreshRoutes, applyRoute };

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
          // Adopt the mic captured at call start (no second prompt); engine owns it now.
          await engine.startLocalMedia(earlyStreamRef.current);
          earlyStreamRef.current = null;
          engine.setMuted(useCallStore.getState().muted);
          engineRef.current = engine;
          await routeHelpersRef.current.refreshRoutes();
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

  // Re-scan routes when devices change (BT connect/disconnect) — also during outgoing before engine.
  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    const onChange = () => {
      const phase = useCallStore.getState().phase;
      if (phase === "idle" || phase === "ended") return;
      void routeHelpersRef.current.refreshRoutes({ deviceChange: true });
    };
    md.addEventListener("devicechange", onChange);
    return () => md.removeEventListener("devicechange", onChange);
  }, []);

  return (
    <CallActionsContext.Provider value={actions}>
      {children}
      <CallSounds />
      <CallNotice />
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

/** Brief toast when mic permission is denied or another call notice is set. */
function CallNotice() {
  const notice = useCallStore((s) => s.callNotice);
  if (!notice) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed bottom-6 left-1/2 z-[200] max-w-sm -translate-x-1/2 rounded-xl border border-border bg-surface px-4 py-3 text-center text-sm text-text shadow-elevated animate-fade-in-up"
    >
      {notice}
    </div>
  );
}
