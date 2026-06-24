/**
 * Audio output routing for calls. Mobile menu is intentionally simple:
 *   BT connected → Bluetooth (default) + Earpiece + Speaker
 *   BT off       → Earpiece (default) + Speaker
 * `resolveSinkCandidates` maps logical picks to real device ids; CallEngine tries each until one works.
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
const SPEAKER_RE = /speaker|loud|speakerphone/;
const EARPIECE_RE = /earpiece|receiver|telephone|handset|phone call|in-call|communications/;

/** Built-in mics — never treat as external BT/wired. */
const BUILTIN_RE =
  /built-in|internal|phone microphone|microphone array|iphone microphone|ipad microphone|android microphone|^default$/;

export function isMobilePhone(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPod/i.test(navigator.userAgent);
}

/** Runtime check — Android Chrome may support setSinkId on instances without prototype entry. */
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

/**
 * Mobile dropdown — never includes "Headset" unless we add wired support later.
 * BT on:  Bluetooth + Earpiece + Speaker
 * BT off: Earpiece + Speaker
 */
function buildMobileRoutes(devices: MediaDeviceInfo[]): AudioRoute[] {
  const hasBt = detectBluetoothConnected(devices);
  const routes: AudioRoute[] = [];
  if (hasBt) {
    routes.push({ kind: "bluetooth", deviceId: LOGICAL_ROUTE_ID.bluetooth, label: routeLabel("bluetooth") });
  }
  routes.push({ kind: "earpiece", deviceId: LOGICAL_ROUTE_ID.earpiece, label: routeLabel("earpiece") });
  routes.push({ kind: "speaker", deviceId: LOGICAL_ROUTE_ID.speaker, label: routeLabel("speaker") });
  return routes;
}

function classifyDesktop(label: string): AudioRouteKind {
  const l = label.toLowerCase();
  if (BLUETOOTH_RE.test(l)) return "bluetooth";
  if (SPEAKER_RE.test(l)) return "speaker";
  if (EARPIECE_RE.test(l)) return "earpiece";
  return "default";
}

function buildDesktopRoutes(devices: MediaDeviceInfo[]): AudioRoute[] {
  const outputs = devices.filter((d) => d.kind === "audiooutput");
  const byKind = new Map<AudioRouteKind, AudioRoute>();
  for (const d of outputs) {
    const kind = classifyDesktop(d.label);
    if (kind === "default") continue;
    const existing = byKind.get(kind);
    if (!existing || (!existing.deviceId && d.deviceId)) {
      byKind.set(kind, { kind, deviceId: d.deviceId, label: d.label || routeLabel(kind) });
    }
  }
  const routes = [...byKind.values()];
  if (routes.length === 0) routes.push({ kind: "speaker", deviceId: "", label: routeLabel("speaker") });
  return routes;
}

export async function listAudioRoutes(): Promise<AudioRoute[]> {
  const fallbackMobile = [
    { kind: "earpiece" as const, deviceId: LOGICAL_ROUTE_ID.earpiece, label: routeLabel("earpiece") },
    { kind: "speaker" as const, deviceId: LOGICAL_ROUTE_ID.speaker, label: routeLabel("speaker") },
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
  const order: AudioRouteKind[] = isMobilePhone()
    ? ["bluetooth", "earpiece", "speaker"]
    : ["bluetooth", "headset", "earpiece", "speaker", "default"];
  for (const kind of order) {
    const match = routes.find((r) => r.kind === kind);
    if (match) return match;
  }
  return routes[0] ?? { kind: "earpiece", deviceId: LOGICAL_ROUTE_ID.earpiece, label: routeLabel("earpiece") };
}

/**
 * Ordered sink ids to try for a logical route. CallEngine walks the list until `setSinkId` succeeds.
 * Works even when the browser exposes sparse output labels (common on Android).
 */
export async function resolveSinkCandidates(route: AudioRoute): Promise<string[]> {
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
        // Non-default, non-communications outputs are often the loudspeaker on Android.
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
        // Fall back to default — OS routes to BT when connected.
        return [...new Set([...ids, "default", ""])];
      }
      default:
        return route.deviceId ? [route.deviceId] : [""];
    }
  } catch {
    return [""];
  }
}

/** @deprecated Use resolveSinkCandidates — kept for compatibility. */
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
