/**
 * Audio output routing for calls. Exposes user-facing routes (Bluetooth / Earpiece / Speaker /
 * Headset) with stable logical ids so the dropdown always works on mobile — even when the browser
 * exposes no switchable output devices. `resolveSinkId` maps a logical route to a real device id for
 * `setSinkId` where supported.
 */

export type AudioRouteKind = "bluetooth" | "headset" | "speaker" | "earpiece" | "default";

export interface AudioRoute {
  kind: AudioRouteKind;
  deviceId: string;
  label: string;
}

/** Stable ids for logical routes (used in the dropdown + store). */
export const LOGICAL_ROUTE_ID = {
  bluetooth: "__bluetooth__",
  headset: "__headset__",
  earpiece: "__earpiece__",
  speaker: "__speaker__",
} as const;

/** Priority when auto-selecting: BT first, then earpiece (phone receiver), then wired, speaker last. */
const PRIORITY: AudioRouteKind[] = ["bluetooth", "headset", "earpiece", "speaker", "default"];

const BLUETOOTH_RE =
  /bluetooth|airpod|buds|wireless|\bbt\b|\btws\b|handsfree|jabra|jbl|boat|sony wf|galaxy buds|wh-1000|qc35|qc45/;
const HEADSET_RE = /head(set|phone)|earphone|wired|earpods|usb audio|\baux\b/;
const SPEAKER_RE = /speaker|loud/;
const EARPIECE_RE = /earpiece|receiver|telephone|handset/;
/** Built-in phone mic/speaker labels — must NOT count as external headset/BT. */
const BUILTIN_RE =
  /built-in|internal|^default$|phone microphone|microphone array|iphone microphone|ipad microphone|android microphone/;

export function isMobilePhone(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPod/i.test(navigator.userAgent);
}

/** Whether this browser can call `HTMLMediaElement.setSinkId`. */
export function canSwitchOutput(): boolean {
  return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
}

function classify(label: string): AudioRouteKind {
  const l = label.toLowerCase();
  if (BLUETOOTH_RE.test(l)) return "bluetooth";
  if (HEADSET_RE.test(l)) return "headset";
  if (SPEAKER_RE.test(l)) return "speaker";
  if (EARPIECE_RE.test(l)) return "earpiece";
  return "default";
}

function isExternalLabel(label: string): boolean {
  const l = label.toLowerCase();
  if (!l) return false;
  return !BUILTIN_RE.test(l);
}

/** True when a **connected external** Bluetooth audio device is visible in device labels. */
export function detectBluetoothConnected(devices: MediaDeviceInfo[]): boolean {
  return devices.some((d) => {
    const l = d.label.toLowerCase();
    return l && isExternalLabel(l) && BLUETOOTH_RE.test(l);
  });
}

/** True when a wired external headset is connected (not built-in, not Bluetooth). */
function detectWiredHeadset(devices: MediaDeviceInfo[]): boolean {
  return devices.some((d) => {
    const l = d.label.toLowerCase();
    return l && isExternalLabel(l) && HEADSET_RE.test(l) && !BLUETOOTH_RE.test(l);
  });
}

/**
 * Mobile menu: always Earpiece + Speaker; add Bluetooth / wired Headset when connected.
 * Discord/WhatsApp-style — dropdown is never empty on a phone.
 */
function buildMobileRoutes(devices: MediaDeviceInfo[]): AudioRoute[] {
  const routes: AudioRoute[] = [];
  if (detectBluetoothConnected(devices)) {
    routes.push({ kind: "bluetooth", deviceId: LOGICAL_ROUTE_ID.bluetooth, label: routeLabel("bluetooth") });
  }
  if (detectWiredHeadset(devices)) {
    routes.push({ kind: "headset", deviceId: LOGICAL_ROUTE_ID.headset, label: routeLabel("headset") });
  }
  routes.push({ kind: "earpiece", deviceId: LOGICAL_ROUTE_ID.earpiece, label: routeLabel("earpiece") });
  routes.push({ kind: "speaker", deviceId: LOGICAL_ROUTE_ID.speaker, label: routeLabel("speaker") });
  return routes;
}

/** Desktop: enumerate real outputs, de-duped by kind; fall back to speaker. */
function buildDesktopRoutes(devices: MediaDeviceInfo[]): AudioRoute[] {
  const outputs = devices.filter((d) => d.kind === "audiooutput");
  const byKind = new Map<AudioRouteKind, AudioRoute>();

  const add = (route: AudioRoute) => {
    const existing = byKind.get(route.kind);
    if (!existing || (!existing.deviceId && route.deviceId)) byKind.set(route.kind, route);
  };

  for (const d of outputs) {
    const kind = classify(d.label);
    if (kind === "default") continue;
    add({ kind, deviceId: d.deviceId, label: d.label || routeLabel(kind) });
  }

  const routes = [...byKind.values()];
  if (routes.length === 0) {
    routes.push({ kind: "speaker", deviceId: "", label: routeLabel("speaker") });
  }
  return routes;
}

/**
 * List routes for the audio dropdown. On phones this is always ≥ 2 (Earpiece + Speaker, + BT when
 * connected). Labels must be populated — call after `getUserMedia`.
 */
export async function listAudioRoutes(): Promise<AudioRoute[]> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return isMobilePhone()
      ? [
          { kind: "earpiece", deviceId: LOGICAL_ROUTE_ID.earpiece, label: routeLabel("earpiece") },
          { kind: "speaker", deviceId: LOGICAL_ROUTE_ID.speaker, label: routeLabel("speaker") },
        ]
      : [{ kind: "speaker", deviceId: "", label: routeLabel("speaker") }];
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return isMobilePhone() ? buildMobileRoutes(devices) : buildDesktopRoutes(devices);
  } catch {
    return isMobilePhone()
      ? [
          { kind: "earpiece", deviceId: LOGICAL_ROUTE_ID.earpiece, label: routeLabel("earpiece") },
          { kind: "speaker", deviceId: LOGICAL_ROUTE_ID.speaker, label: routeLabel("speaker") },
        ]
      : [{ kind: "speaker", deviceId: "", label: routeLabel("speaker") }];
  }
}

/** Default route: Bluetooth if connected, else Earpiece on phone, else best desktop route. */
export function pickPreferredRoute(routes: AudioRoute[]): AudioRoute {
  for (const kind of PRIORITY) {
    const match = routes.find((r) => r.kind === kind);
    if (match) return match;
  }
  return routes[0] ?? { kind: "earpiece", deviceId: LOGICAL_ROUTE_ID.earpiece, label: routeLabel("earpiece") };
}

/** Map a logical (or real) route to the device id passed to `setSinkId`. Best-effort on mobile. */
export async function resolveSinkId(route: AudioRoute): Promise<string> {
  if (!canSwitchOutput() || !navigator.mediaDevices?.enumerateDevices) return "";

  try {
    const outputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audiooutput");

    switch (route.deviceId) {
      case LOGICAL_ROUTE_ID.speaker: {
        const speaker =
          outputs.find((d) => SPEAKER_RE.test(d.label)) ??
          outputs.find((d) => d.deviceId !== "default" && d.deviceId !== "communications");
        return speaker?.deviceId ?? "";
      }
      case LOGICAL_ROUTE_ID.earpiece: {
        const earpiece = outputs.find((d) => EARPIECE_RE.test(d.label));
        const comm = outputs.find((d) => d.deviceId === "communications");
        return earpiece?.deviceId ?? comm?.deviceId ?? "default";
      }
      case LOGICAL_ROUTE_ID.bluetooth: {
        const bt = outputs.find((d) => BLUETOOTH_RE.test(d.label));
        return bt?.deviceId ?? "";
      }
      case LOGICAL_ROUTE_ID.headset: {
        const hs = outputs.find((d) => HEADSET_RE.test(d.label) && !BLUETOOTH_RE.test(d.label));
        return hs?.deviceId ?? "";
      }
      default:
        return route.deviceId;
    }
  } catch {
    return "";
  }
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

/** Find a route in the list by logical/real device id or by kind. */
export function findRoute(routes: AudioRoute[], deviceIdOrKind: string): AudioRoute | undefined {
  return (
    routes.find((r) => r.deviceId === deviceIdOrKind) ??
    routes.find((r) => r.kind === deviceIdOrKind)
  );
}

/** The next route when cycling (legacy). */
export function nextRoute(routes: AudioRoute[], current: AudioRouteKind): AudioRoute {
  if (routes.length <= 1) return routes[0] ?? { kind: "earpiece", deviceId: LOGICAL_ROUTE_ID.earpiece, label: "Earpiece" };
  const idx = routes.findIndex((r) => r.kind === current);
  return routes[(idx + 1) % routes.length]!;
}
