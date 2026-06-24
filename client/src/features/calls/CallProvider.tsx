import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { SOCKET_EVENTS } from "@linkr/shared";
import type {
  CallInitiateAck,
  CallMedia,
  CallSignalPayload,
  CallSyncActiveCall,
  CallSyncResponse,
  PublicUser,
  WebRtcIceCandidatePayload,
  WebRtcSdpPayload,
} from "@linkr/shared";
import { getSocket } from "@/lib/socket/client";
import { useAuthStore, useCallStore } from "@/lib/store";
import type { CallEndReason } from "@/lib/store";
import { CallEngine } from "./CallEngine";
import { fetchIceConfig } from "./useIceConfig";
import { callLog } from "./callLog";
import { clearCallSignalingHandlers, setCallSignalingHandlers } from "./callSignalingRegistry";
import { mediaAccessMessage, requestCallMediaAccess } from "./micPermission";
import { startCallTone, stopCallTone, playEndTone, setCallToneSink, resetCallToneSink } from "./callSounds";
import {
  isMobilePhone,
  listAudioRoutes,
  nextRoute,
  pickPreferredRoute,
  findRoute,
  resolveSinkCandidates,
  supportsSetSinkId,
  canSwitchAudioOutput,
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
  /** Toggle the local camera on/off (video calls). No-op for voice calls. */
  toggleCamera: () => void;
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
  /** Answer that arrived before the caller's post-sync offer completes (Phase 3.1.6). */
  const pendingAnswerAfterOfferRef = useRef<WebRtcSdpPayload | null>(null);
  // Caller's mic captured early (during "Calling…") to unlock device labels so the audio-route icon
  // is correct before connect; adopted by the engine on accept, or stopped on teardown.
  const earlyStreamRef = useRef<MediaStream | null>(null);
  // Audio-output routes available on this device (re-scanned on connect + device changes).
  const routesRef = useRef<AudioRoute[]>([]);
  const noticeTimerRef = useRef<number | null>(null);
  /** Prevents double offer if accept/ringing fire twice (Phase 3.1.11). */
  const callerOfferStartedRef = useRef<Set<string>>(new Set());
  /** Latest accept/ringing handlers for early socket bridge (Phase 3.1.11). */
  const signalingRef = useRef<{
    onAccept?: (payload: CallSignalPayload) => void;
    onRinging?: (payload: CallSignalPayload) => void;
  }>({});
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

    const teardown = (reason: CallEndReason, opts?: { signal?: boolean }) => {
      const { callId, chatId, phase, direction } = useCallStore.getState();
      const shouldSignal = opts?.signal !== false;
      if (shouldSignal && callId && chatId && phase !== "idle" && phase !== "ended") {
        if (reason === "rejected" && direction === "incoming") {
          emit(SOCKET_EVENTS.CALL_REJECT, { callId, chatId });
        } else if (reason === "failed" || reason === "no-mic" || reason === "hangup") {
          emit(SOCKET_EVENTS.CALL_END, { callId, chatId });
        }
      }

      engineRef.current?.close();
      engineRef.current = null;
      pendingOfferRef.current = null;
      pendingIceRef.current = [];
      routesRef.current = [];
      resetCallToneSink();
      // Release the early mic stream if it was never adopted by an engine.
      earlyStreamRef.current?.getTracks().forEach((t) => t.stop());
      earlyStreamRef.current = null;
      useCallStore.getState().setLocalStream(null);
      useCallStore.getState().setRemoteStream(null);
      useCallStore.getState().endCall(reason);
      if (endTimerRef.current) window.clearTimeout(endTimerRef.current);
      // Briefly show the end state, then return to idle.
      endTimerRef.current = window.setTimeout(() => useCallStore.getState().reset(), 1400);
    };

    /** Apply output route — desktop: setSinkId; mobile: earpiece/BT OS route or best-effort speaker. */
    const applyRoute = (route: AudioRoute, opts?: { forceStore?: boolean; userInitiated?: boolean }) => {
      void (async () => {
        if (!canSwitchAudioOutput()) {
          const engine = engineRef.current;
          if (isMobilePhone() && engine) {
            await engine.setMobileSpeakerMode(route.kind === "speaker");
          }
          useCallStore.getState().setAudioRoute(route.kind, route.deviceId);
          return;
        }

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

        if (applied || opts?.forceStore) {
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
        onRemoteStream: (stream) => useCallStore.getState().setRemoteStream(stream),
      });
      await engine.startLocalMedia(earlyStreamRef.current);
      earlyStreamRef.current = null;
      engineRef.current = engine;
      useCallStore.getState().setLocalStream(engine.getLocalStream());
      // Apply mute/camera, scan + apply the audio route, then flush any buffered remote signaling.
      engine.setMuted(useCallStore.getState().muted);
      engine.setCameraEnabled(!useCallStore.getState().cameraOff);
      void refreshRoutes({ initial: !useCallStore.getState().audioDeviceId });
      for (const c of pendingIceRef.current) void engine.addIceCandidate(c);
      pendingIceRef.current = [];
      return engine;
    };

    const startCall: CallActions["startCall"] = ({ chatId, peer, media = "audio" }) => {
      const phase = useCallStore.getState().phase;
      if (phase === "ended") useCallStore.getState().reset();
      if (useCallStore.getState().phase !== "idle") return;

      void (async () => {
        const cap = await requestCallMediaAccess(media);
        if (!cap.ok) {
          showNotice(mediaAccessMessage(cap.reason, media));
          return;
        }
        earlyStreamRef.current = cap.stream;

        const callId = crypto.randomUUID();
        useCallStore.getState().startOutgoing({ callId, chatId, media, peer });
        // Show the local camera preview immediately while we wait for the callee (video calls).
        useCallStore.getState().setLocalStream(cap.stream);
        await refreshRoutes({ initial: true });

        getSocket()?.emit(
          SOCKET_EVENTS.CALL_INITIATE,
          { callId, chatId, media },
          (res?: CallInitiateAck) => {
            if (res?.ok) {
              // "Ringing…" only after server emits call:ringing (callee acked) — Phase 3.1.8.
              useCallStore.getState().setRinging(false);
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

      void (async () => {
        const cap = await requestCallMediaAccess(media);
        if (!cap.ok) {
          showNotice(mediaAccessMessage(cap.reason, media));
          teardown("no-mic");
          return;
        }
        earlyStreamRef.current = cap.stream;

        useCallStore.getState().setConnecting();
        // Show the local camera preview immediately while connecting (video calls).
        useCallStore.getState().setLocalStream(cap.stream);
        emit(SOCKET_EVENTS.CALL_ACCEPT, { callId, chatId } as CallSignalPayload);

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
          teardown("no-mic");
        }
      })();
    };

    const rejectCall: CallActions["rejectCall"] = () => {
      teardown("rejected");
    };

    const hangUp: CallActions["hangUp"] = () => {
      const { phase } = useCallStore.getState();
      if (phase === "idle" || phase === "ended") return;
      teardown("hangup");
    };

    const toggleMute: CallActions["toggleMute"] = () => {
      useCallStore.getState().toggleMute();
      engineRef.current?.setMuted(useCallStore.getState().muted);
    };

    const toggleCamera: CallActions["toggleCamera"] = () => {
      if (useCallStore.getState().media !== "video") return;
      useCallStore.getState().toggleCamera();
      engineRef.current?.setCameraEnabled(!useCallStore.getState().cameraOff);
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
      toggleCamera,
      cycleAudioRoute,
      selectAudioRoute,
      minimize,
      expand,
    };
  }, []);

  // Subscribe to call signaling once authenticated. Re-bind on every socket connect (Phase 3.1.11 —
  // child CallProvider effect runs before parent SocketProvider creates the socket on first mount).
  useEffect(() => {
    if (status !== "authed" || !accessToken) return;

    let disposed = false;
    let handlerCleanup: (() => void) | undefined;
    let syncPollId: number | undefined;
    let attachPollId: number | undefined;
    let handlersBound = false;
    const syncRunner = { fn: null as (() => void) | null };

    setCallSignalingHandlers({
      onAccept: (p) => signalingRef.current.onAccept?.(p),
      onRinging: (p) => signalingRef.current.onRinging?.(p),
    });

    const attach = () => {
      handlerCleanup?.();
      handlerCleanup = undefined;

      const socket = getSocket();
      if (!socket || disposed) return;

      const emit = (event: string, payload: unknown) => socket.emit(event, payload);

      // Callee accepted → caller creates the offer (also used after call:sync restore).
      const beginCallerConnect = () => {
        const { callId, chatId, media } = useCallStore.getState();
        if (!callId || !chatId) {
          callLog("beginCallerConnect skipped (no callId/chatId)");
          return;
        }
        if (callerOfferStartedRef.current.has(callId)) {
          callLog("beginCallerConnect skipped (already started)", { callId });
          return;
        }
        callerOfferStartedRef.current.add(callId);
        callLog("beginCallerConnect start", { callId });
        useCallStore.getState().setConnecting();

        void (async () => {
          try {
            callLog("fetchIceConfig");
            const iceServers = await fetchIceConfig();
            callLog("fetchIceConfig ok", { servers: iceServers.length });
            const engine = new CallEngine(iceServers, media, {
              onIceCandidate: (candidate) =>
                emit(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, { callId, chatId, candidate }),
              onConnectionStateChange: (state) => {
                useCallStore.getState().setConnection(state);
                callLog("pc connectionState", { callId, state });
                if (state === "connected") useCallStore.getState().setActive();
                if (state === "failed") {
                  engineRef.current?.close();
                  engineRef.current = null;
                  earlyStreamRef.current?.getTracks().forEach((t) => t.stop());
                  earlyStreamRef.current = null;
                  pendingOfferRef.current = null;
                  pendingIceRef.current = [];
                  pendingAnswerAfterOfferRef.current = null;
                  callerOfferStartedRef.current.delete(callId);
                  useCallStore.getState().setLocalStream(null);
                  useCallStore.getState().setRemoteStream(null);
                  useCallStore.getState().endCall("failed");
                  emit(SOCKET_EVENTS.CALL_END, { callId, chatId });
                  window.setTimeout(() => useCallStore.getState().reset(), 1400);
                }
              },
              onRemoteStream: (stream) => useCallStore.getState().setRemoteStream(stream),
            });
            await engine.startLocalMedia(earlyStreamRef.current);
            earlyStreamRef.current = null;
            engine.setMuted(useCallStore.getState().muted);
            engine.setCameraEnabled(!useCallStore.getState().cameraOff);
            engineRef.current = engine;
            useCallStore.getState().setLocalStream(engine.getLocalStream());
            await routeHelpersRef.current.refreshRoutes();
            for (const c of pendingIceRef.current) void engine.addIceCandidate(c);
            pendingIceRef.current = [];

            const offer = await engine.createOffer();
            callLog("webrtc:offer sending", { callId });
            emit(SOCKET_EVENTS.WEBRTC_OFFER, {
              callId,
              chatId,
              description: offer as WebRtcSdpPayload["description"],
            });

            const bufferedAnswer = pendingAnswerAfterOfferRef.current;
            if (bufferedAnswer) {
              pendingAnswerAfterOfferRef.current = null;
              await engine.setRemoteDescription(bufferedAnswer.description);
            }
          } catch (err) {
            callLog("beginCallerConnect failed", {
              callId,
              err: err instanceof Error ? err.message : String(err),
            });
            callerOfferStartedRef.current.delete(callId);
            engineRef.current?.close();
            engineRef.current = null;
            earlyStreamRef.current?.getTracks().forEach((t) => t.stop());
            earlyStreamRef.current = null;
            emit(SOCKET_EVENTS.CALL_END, { callId, chatId });
            useCallStore.getState().endCall("no-mic");
            window.setTimeout(() => useCallStore.getState().reset(), 1400);
          }
        })();
      };

      const onAccept = (payload: CallSignalPayload) => {
        const { phase, callId } = useCallStore.getState();
        callLog("call:accept handler", { callId: payload.callId, phase, storeCallId: callId });
        if (payload.callId === callId && phase === "outgoing") {
          beginCallerConnect();
          return;
        }
        if ((phase === "idle" || phase === "ended") && payload.callId && payload.chatId) {
          socket.emit(SOCKET_EVENTS.CALL_SYNC, {}, (res?: CallSyncResponse) => {
            if (res?.call?.callId === payload.callId && res.call.role === "caller") {
              applySyncResponse(res.call);
            }
          });
        }
      };

      const restoreCalleeConnecting = (syncCall: CallSyncActiveCall) => {
      const { callId, chatId, media, replay } = syncCall;
      if (!callId || !chatId) return;

      void (async () => {
        const cap = await requestCallMediaAccess(media);
        if (!cap.ok) {
          emit(SOCKET_EVENTS.CALL_END, { callId, chatId });
          useCallStore.getState().endCall("no-mic");
          window.setTimeout(() => useCallStore.getState().reset(), 1400);
          return;
        }
        earlyStreamRef.current = cap.stream;
        useCallStore.getState().setLocalStream(cap.stream);
        if (replay?.offer) pendingOfferRef.current = replay.offer;

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
                earlyStreamRef.current?.getTracks().forEach((t) => t.stop());
                earlyStreamRef.current = null;
                pendingOfferRef.current = null;
                pendingIceRef.current = [];
                useCallStore.getState().setLocalStream(null);
                useCallStore.getState().setRemoteStream(null);
                useCallStore.getState().endCall("failed");
                emit(SOCKET_EVENTS.CALL_END, { callId, chatId });
                window.setTimeout(() => useCallStore.getState().reset(), 1400);
              }
            },
            onRemoteStream: (stream) => useCallStore.getState().setRemoteStream(stream),
          });
          await engine.startLocalMedia(earlyStreamRef.current);
          earlyStreamRef.current = null;
          engine.setMuted(useCallStore.getState().muted);
          engine.setCameraEnabled(!useCallStore.getState().cameraOff);
          engineRef.current = engine;
          useCallStore.getState().setLocalStream(engine.getLocalStream());
          await routeHelpersRef.current.refreshRoutes();
          for (const c of pendingIceRef.current) void engine.addIceCandidate(c);
          pendingIceRef.current = [];

          const offer = pendingOfferRef.current ?? replay?.offer;
          if (offer) {
            pendingOfferRef.current = null;
            await engine.setRemoteDescription(offer.description);
            const answer = await engine.createAnswer();
            callLog("webrtc:answer sending", { callId });
            emit(SOCKET_EVENTS.WEBRTC_ANSWER, {
              callId,
              chatId,
              description: answer as WebRtcSdpPayload["description"],
            });
          }
        } catch (err) {
          callLog("callee connect failed", {
            callId,
            err: err instanceof Error ? err.message : String(err),
          });
          engineRef.current?.close();
          engineRef.current = null;
          earlyStreamRef.current?.getTracks().forEach((t) => t.stop());
          earlyStreamRef.current = null;
          emit(SOCKET_EVENTS.CALL_END, { callId, chatId });
          useCallStore.getState().endCall("no-mic");
          window.setTimeout(() => useCallStore.getState().reset(), 1400);
        }
      })();
    };

      const applySyncResponse = (syncCall: CallSyncActiveCall) => {
      const state = useCallStore.getState();
      if (state.phase !== "idle" && state.phase !== "ended") {
        if (state.callId === syncCall.callId) return;
        if (state.phase === "active" || state.phase === "connecting") return;
      }
      if (state.phase === "ended") useCallStore.getState().reset();

      engineRef.current?.close();
      engineRef.current = null;
      earlyStreamRef.current?.getTracks().forEach((t) => t.stop());
      earlyStreamRef.current = null;
      pendingOfferRef.current = null;
      pendingIceRef.current = [];
      pendingAnswerAfterOfferRef.current = null;
      if (endTimerRef.current) window.clearTimeout(endTimerRef.current);

      useCallStore.getState().restoreFromSync({
        callId: syncCall.callId,
        chatId: syncCall.chatId,
        media: syncCall.media,
        peer: syncCall.peer,
        role: syncCall.role,
        phase: syncCall.phase,
        ringing: syncCall.ringing,
      });

      const { replay } = syncCall;
      if (syncCall.role === "caller" && syncCall.phase === "connecting" && replay?.accepted) {
        if (replay.answer) pendingAnswerAfterOfferRef.current = replay.answer;
        void (async () => {
          const cap = await requestCallMediaAccess(syncCall.media);
          if (!cap.ok) {
            emit(SOCKET_EVENTS.CALL_END, { callId: syncCall.callId, chatId: syncCall.chatId });
            useCallStore.getState().endCall("no-mic");
            window.setTimeout(() => useCallStore.getState().reset(), 1400);
            return;
          }
          earlyStreamRef.current = cap.stream;
          useCallStore.getState().setLocalStream(cap.stream);
          beginCallerConnect();
        })();
        return;
      }
      if (syncCall.role === "callee" && syncCall.phase === "connecting") {
        restoreCalleeConnecting(syncCall);
      }
    };

      const runCallSync = () => {
        if (!socket.connected) return;
        socket.emit(SOCKET_EVENTS.CALL_SYNC, {}, (res?: CallSyncResponse) => {
          if (res?.call) {
            applySyncResponse(res.call);
            return;
          }
          const phase = useCallStore.getState().phase;
          if (phase === "idle" || phase === "ended") {
            socket.emit(SOCKET_EVENTS.CALL_CLEAR_STALE);
            if (phase === "ended") useCallStore.getState().reset();
          }
        });
      };

      const onAnswer = (payload: WebRtcSdpPayload) => {
        if (payload.callId !== useCallStore.getState().callId) return;
        callLog("webrtc:answer received", { callId: payload.callId });
        const engine = engineRef.current;
        if (!engine) {
          pendingAnswerAfterOfferRef.current = payload;
          return;
        }
        void engine.setRemoteDescription(payload.description);
      };

      const onOffer = (payload: WebRtcSdpPayload) => {
        if (payload.callId !== useCallStore.getState().callId) return;
        callLog("webrtc:offer received", { callId: payload.callId });
        const engine = engineRef.current;
        if (!engine) {
          pendingOfferRef.current = payload;
          return;
        }
        void (async () => {
          await engine.setRemoteDescription(payload.description);
          const answer = await engine.createAnswer();
          callLog("webrtc:answer sending", { callId: payload.callId });
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
        callerOfferStartedRef.current.delete(payload.callId);
        engineRef.current?.close();
        engineRef.current = null;
        pendingOfferRef.current = null;
        pendingIceRef.current = [];
        useCallStore.getState().setLocalStream(null);
        useCallStore.getState().setRemoteStream(null);
        useCallStore.getState().endCall(reason);
        window.setTimeout(() => useCallStore.getState().reset(), 1400);
      };

      const onReject = finishRemote("rejected");
      const onEnd = finishRemote("hangup");

      const onRinging = (payload: CallSignalPayload) => {
        if (payload.callId !== useCallStore.getState().callId) return;
        if (useCallStore.getState().phase === "outgoing") {
          callLog("call:ringing → Ringing…", { callId: payload.callId });
          useCallStore.getState().setRinging(true);
        }
      };

      setCallSignalingHandlers({
        onAccept: (p) => signalingRef.current.onAccept?.(p),
        onRinging: (p) => signalingRef.current.onRinging?.(p),
      });
      signalingRef.current = { onAccept, onRinging };

      socket.on(SOCKET_EVENTS.CALL_REJECT, onReject);
      socket.on(SOCKET_EVENTS.CALL_END, onEnd);
      socket.on(SOCKET_EVENTS.WEBRTC_OFFER, onOffer);
      socket.on(SOCKET_EVENTS.WEBRTC_ANSWER, onAnswer);
      socket.on(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, onIce);

      runCallSync();
      syncRunner.fn = runCallSync;
      socket.on("connect", runCallSync);

      callLog("call handlers bound", { socketId: socket.id });
      handlersBound = true;

      handlerCleanup = () => {
        handlersBound = false;
        syncRunner.fn = null;
        signalingRef.current = {};
        socket.off("connect", runCallSync);
        socket.off(SOCKET_EVENTS.CALL_REJECT, onReject);
        socket.off(SOCKET_EVENTS.CALL_END, onEnd);
        socket.off(SOCKET_EVENTS.WEBRTC_OFFER, onOffer);
        socket.off(SOCKET_EVENTS.WEBRTC_ANSWER, onAnswer);
        socket.off(SOCKET_EVENTS.WEBRTC_ICE_CANDIDATE, onIce);
      };
    };

    attach();

    attachPollId = window.setInterval(() => {
      if (disposed || handlersBound) return;
      if (getSocket()) attach();
    }, 50);
    window.setTimeout(() => {
      if (attachPollId) window.clearInterval(attachPollId);
    }, 5000);

    const onSocketConnect = () => attach();
    getSocket()?.on("connect", onSocketConnect);

    syncPollId = window.setInterval(() => {
      const phase = useCallStore.getState().phase;
      if (phase !== "idle" && phase !== "ended") return;
      syncRunner.fn?.();
    }, 4_000);

    return () => {
      disposed = true;
      clearCallSignalingHandlers();
      if (attachPollId) window.clearInterval(attachPollId);
      if (syncPollId) window.clearInterval(syncPollId);
      getSocket()?.off("connect", onSocketConnect);
      handlerCleanup?.();
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

  // Force-reset stale "ended" phase so the next incoming call is not auto-rejected.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (useCallStore.getState().phase === "ended") {
        useCallStore.getState().reset();
      }
    }, 2_000);
    return () => window.clearInterval(id);
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
