/**
 * Audio output routing for calls.
 * Mobile (Sprint 3.1.8): OS routes call audio — BT when connected, earpiece otherwise.
 *   Indicator is read-only; no setSinkId on phone browsers.
 * Desktop (Sprint 3.1.7): every audiooutput listed; setSinkId switches for real.
 */

export type AudioRouteKind = "bluetooth" | "headset" | "speaker" | "earpiece" | "default";

export interface AudioRoute {
  kind: AudioRouteKind;
  deviceId: string;
  label: string;
}

export const LOGICAL_ROUTE_ID = {
  bluetooth: "__bluetooth__",
  headset: "__headset__",
  earpiece: "__earpiece__",
  speaker: "__speaker__",
} as const;

const BLUETOOTH_RE =
  /bluetooth|airpod|buds|wireless|\bbt\b|\btws\b|handsfree|jabra|jbl|boat|sony wf|galaxy buds|wh-1000|qc35|qc45/;
const SPEAKER_RE = /speaker|loud|speakerphone|realtek|display audio|monitor|hdmi/;
const EARPIECE_RE = /earpiece|receiver|telephone|handset|phone call|in-call|communications/;
const HEADSET_RE = /headphone|headset|earbud|earphone/i;

/** Built-in mics — never treat as external BT/wired. */
const BUILTIN_RE =
  /built-in|internal|phone microphone|microphone array|iphone microphone|ipad microphone|android microphone|^default$/;

export function isMobilePhone(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPod/i.test(navigator.userAgent);
}

export function isLogicalRouteId(deviceId: string): boolean {
  return Object.values(LOGICAL_ROUTE_ID).includes(deviceId as (typeof LOGICAL_ROUTE_ID)[keyof typeof LOGICAL_ROUTE_ID]);
}

/** Runtime check — desktop Chromium supports setSinkId; mobile Chrome does not. */
export function supportsSetSinkId(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.createElement("audio");
  return typeof (el as HTMLAudioElement & { setSinkId?: unknown }).setSinkId === "function";
}

function isExternalLabel(label: string): boolean {
  const l = label.toLowerCase();
  return Boolean(l) && !BUILTIN_RE.test(l);
}

/** External Bluetooth audio device visible (usually as an audio *input* on Android). */
export function detectBluetoothConnected(devices: MediaDeviceInfo[]): boolean {
  return devices.some((d) => {
    const l = d.label.toLowerCase();
    return l && isExternalLabel(l) && BLUETOOTH_RE.test(l);
  });
}

function findBluetoothGroupId(devices: MediaDeviceInfo[]): string | null {
  const bt = devices.find(
    (d) => d.label && isExternalLabel(d.label) && BLUETOOTH_RE.test(d.label.toLowerCase()),
  );
  return bt?.groupId ?? null;
}

/** Whether the app can programmatically switch call audio (desktop Chromium only). */
export function canSwitchAudioOutput(): boolean {
  return supportsSetSinkId();
}

/** Mobile indicator — single detected route (BT or earpiece); no fake Speaker menu. */
function buildMobileRoutes(devices: MediaDeviceInfo[]): AudioRoute[] {
  const hasBt = detectBluetoothConnected(devices);
  if (hasBt) {
    return [{ kind: "bluetooth", deviceId: LOGICAL_ROUTE_ID.bluetooth, label: routeLabel("bluetooth") }];
  }
  return [{ kind: "earpiece", deviceId: LOGICAL_ROUTE_ID.earpiece, label: routeLabel("earpiece") }];
}

function classifyDesktop(label: string): AudioRouteKind {
  const l = label.toLowerCase();
  if (BLUETOOTH_RE.test(l)) return "bluetooth";
  if (HEADSET_RE.test(l) && !SPEAKER_RE.test(l)) return "headset";
  if (SPEAKER_RE.test(l)) return "speaker";
  if (EARPIECE_RE.test(l)) return "earpiece";
  return "default";
}

/** Desktop: list every audio output with its real device id and OS label. */
function buildDesktopRoutes(devices: MediaDeviceInfo[]): AudioRoute[] {
  const outputs = devices.filter((d) => d.kind === "audiooutput");
  if (outputs.length === 0) {
    return [{ kind: "speaker", deviceId: "", label: routeLabel("speaker") }];
  }
  return outputs.map((d) => {
    const kind = classifyDesktop(d.label);
    return {
      kind,
      deviceId: d.deviceId,
      label: d.label.trim() || routeLabel(kind),
    };
  });
}

export async function listAudioRoutes(): Promise<AudioRoute[]> {
  const fallbackMobile = [
    { kind: "earpiece" as const, deviceId: LOGICAL_ROUTE_ID.earpiece, label: routeLabel("earpiece") },
  ];
  if (!navigator.mediaDevices?.enumerateDevices) {
    return isMobilePhone() ? fallbackMobile : [{ kind: "speaker", deviceId: "", label: routeLabel("speaker") }];
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return isMobilePhone() ? buildMobileRoutes(devices) : buildDesktopRoutes(devices);
  } catch {
    return isMobilePhone() ? fallbackMobile : [{ kind: "speaker", deviceId: "", label: routeLabel("speaker") }];
  }
}

export function pickPreferredRoute(routes: AudioRoute[]): AudioRoute {
  if (isMobilePhone()) {
    const bt = routes.find((r) => r.kind === "bluetooth");
    if (bt) return bt;
    return routes.find((r) => r.kind === "earpiece") ?? routes[0] ?? {
      kind: "earpiece",
      deviceId: LOGICAL_ROUTE_ID.earpiece,
      label: routeLabel("earpiece"),
    };
  }
  const bt = routes.find((r) => r.kind === "bluetooth");
  if (bt) return bt;
  const speaker = routes.find((r) => r.kind === "speaker" || r.kind === "default");
  return speaker ?? routes[0] ?? { kind: "default", deviceId: "", label: routeLabel("default") };
}

/**
 * Sink ids to try for a route. Desktop uses the exact menu device id only (no "" fallback —
 * on Windows "" = system default, which is often still the BT earbuds).
 * Mobile uses logical resolution for sparse Android labels.
 */
export async function resolveSinkCandidates(route: AudioRoute): Promise<string[]> {
  if (route.deviceId && !isLogicalRouteId(route.deviceId)) {
    return [route.deviceId];
  }

  if (!navigator.mediaDevices?.enumerateDevices) {
    return route.kind === "speaker" ? [""] : ["default", ""];
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter((d) => d.kind === "audiooutput");
    const btGroup = findBluetoothGroupId(devices);

    switch (route.kind) {
      case "speaker": {
        const ids = outputs
          .filter((d) => SPEAKER_RE.test(d.label.toLowerCase()))
          .map((d) => d.deviceId);
        const alt = outputs
          .filter((d) => d.deviceId !== "default" && d.deviceId !== "communications" && !BLUETOOTH_RE.test(d.label))
          .map((d) => d.deviceId);
        return [...new Set([...ids, ...alt, ""])];
      }
      case "earpiece": {
        const ids = outputs
          .filter((d) => EARPIECE_RE.test(d.label.toLowerCase()) || d.deviceId === "communications")
          .map((d) => d.deviceId);
        return [...new Set([...ids, "communications", "default", ""])];
      }
      case "bluetooth": {
        const ids = outputs
          .filter(
            (d) =>
              BLUETOOTH_RE.test(d.label.toLowerCase()) || (btGroup && d.groupId === btGroup),
          )
          .map((d) => d.deviceId);
        return [...new Set([...ids, "default", ""])];
      }
      default:
        return route.deviceId ? [route.deviceId] : [""];
    }
  } catch {
    return [""];
  }
}

/** Primary sink id for a route (first candidate). */
export async function resolveSinkId(route: AudioRoute): Promise<string> {
  const candidates = await resolveSinkCandidates(route);
  return candidates[0] ?? "";
}

export function routeLabel(kind: AudioRouteKind): string {
  switch (kind) {
    case "bluetooth":
      return "Bluetooth";
    case "headset":
      return "Headset";
    case "speaker":
      return "Speaker";
    case "earpiece":
      return "Earpiece";
    default:
      return "Default";
  }
}

/** Label shown in the picker — real OS name on desktop, generic kind label on mobile. */
export function routeDisplayLabel(route: AudioRoute): string {
  if (isMobilePhone()) return routeLabel(route.kind);
  return route.label || routeLabel(route.kind);
}

export function findRoute(routes: AudioRoute[], deviceIdOrKind: string): AudioRoute | undefined {
  return (
    routes.find((r) => r.deviceId === deviceIdOrKind) ??
    routes.find((r) => r.kind === deviceIdOrKind)
  );
}

export function nextRoute(routes: AudioRoute[], current: AudioRouteKind): AudioRoute {
  if (routes.length <= 1) return routes[0] ?? { kind: "earpiece", deviceId: LOGICAL_ROUTE_ID.earpiece, label: "Earpiece" };
  const idx = routes.findIndex((r) => r.kind === current);
  return routes[(idx + 1) % routes.length]!;
}
