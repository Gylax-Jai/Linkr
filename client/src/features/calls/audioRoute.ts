/**
 * Audio output routing for calls (Sprint 3.1.2). Classifies the browser's audio-output devices into
 * friendly "routes" (bluetooth / headset / speaker / earpiece) so the user can switch where call
 * audio plays, with sensible auto-priority (Bluetooth > wired headset > speaker/earpiece).
 *
 * Web limits: switching the output sink requires `HTMLMediaElement.setSinkId`, which is supported on
 * Chromium (desktop + Android) but NOT on iOS Safari/Firefox. On unsupported browsers we expose only
 * the system "default" route and the OS controls routing.
 */

export type AudioRouteKind = "bluetooth" | "headset" | "speaker" | "earpiece" | "default";

export interface AudioRoute {
  kind: AudioRouteKind;
  deviceId: string;
  label: string;
}

/** Priority order when auto-selecting a route: earbuds/headset first, speaker last. */
const PRIORITY: AudioRouteKind[] = ["bluetooth", "headset", "earpiece", "speaker", "default"];

/** Whether this browser can actually switch the audio output sink. */
export function canSwitchOutput(): boolean {
  return typeof HTMLMediaElement !== "undefined" && "setSinkId" in HTMLMediaElement.prototype;
}

const BLUETOOTH_RE = /bluetooth|airpod|buds|wireless|\bbt\b|headset/;
const HEADSET_RE = /head(set|phone)|earphone|wired|earpods|usb audio|aux/;
const SPEAKER_RE = /speaker|loud/;
const EARPIECE_RE = /earpiece|receiver/;

function classify(label: string): AudioRouteKind {
  const l = label.toLowerCase();
  if (BLUETOOTH_RE.test(l)) return "bluetooth";
  if (HEADSET_RE.test(l)) return "headset";
  if (SPEAKER_RE.test(l)) return "speaker";
  if (EARPIECE_RE.test(l)) return "earpiece";
  return "default";
}

/**
 * Detect what peripheral is physically connected by scanning ALL device labels (inputs included).
 * On Android Chrome the only *output* device is often the pseudo "Default" whose real target follows
 * the OS — but a connected Bluetooth/wired headset still shows up as an *input* device, so we can
 * infer the true active route from there and label the OS-default sink correctly.
 */
function detectPeripheral(devices: MediaDeviceInfo[]): AudioRouteKind | null {
  const labels = devices
    .map((d) => d.label.toLowerCase())
    .filter(Boolean)
    .join(" | ");
  if (BLUETOOTH_RE.test(labels)) return "bluetooth";
  if (HEADSET_RE.test(labels)) return "headset";
  return null;
}

/**
 * Enumerate audio-output devices and map them to call routes. Best-effort: labels are only populated
 * after a getUserMedia permission grant (which a call already obtains).
 *
 * The OS-default sink ("default"/"communications" pseudo-devices, or an unlabeled output) is relabeled
 * to the *connected peripheral* (Bluetooth/headset) when one is detected — otherwise it's the phone's
 * loudspeaker. This makes the icon reflect reality (e.g. Bluetooth when earbuds are connected) instead
 * of a meaningless "Default". De-dupes by kind, preferring a real device id over a pseudo one.
 */
export async function listAudioRoutes(): Promise<AudioRoute[]> {
  if (!canSwitchOutput() || !navigator.mediaDevices?.enumerateDevices) {
    return [{ kind: "default", deviceId: "", label: "Default" }];
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter((d) => d.kind === "audiooutput");
    const peripheral = detectPeripheral(devices);

    const byKind = new Map<AudioRouteKind, AudioRoute>();
    const add = (route: AudioRoute) => {
      const existing = byKind.get(route.kind);
      // Prefer a concrete device id over the OS-default pseudo so switching actually targets it.
      if (!existing || (!existing.deviceId && route.deviceId)) byKind.set(route.kind, route);
    };

    for (const d of outputs) {
      const isPseudo = d.deviceId === "default" || d.deviceId === "communications" || !d.label;
      let kind = classify(d.label);
      if (kind === "default" || isPseudo) {
        // The OS-default sink routes to the connected peripheral if any, else the loudspeaker.
        kind = peripheral ?? "speaker";
      }
      add({ kind, deviceId: d.deviceId, label: d.label || routeLabel(kind) });
    }

    const routes = [...byKind.values()];
    if (routes.length === 0) {
      routes.push({ kind: peripheral ?? "speaker", deviceId: "", label: routeLabel(peripheral ?? "speaker") });
    }
    return routes;
  } catch {
    return [{ kind: "default", deviceId: "", label: "Default" }];
  }
}

/** Pick the highest-priority available route (earbuds/headset before speaker). */
export function pickPreferredRoute(routes: AudioRoute[]): AudioRoute {
  for (const kind of PRIORITY) {
    const match = routes.find((r) => r.kind === kind);
    if (match) return match;
  }
  return routes[0] ?? { kind: "default", deviceId: "", label: "Default" };
}

/** Short human label for a route, for buttons/tooltips. */
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

/** The next route to use when the user taps the audio button (cycles through available ones). */
export function nextRoute(routes: AudioRoute[], current: AudioRouteKind): AudioRoute {
  if (routes.length <= 1) return routes[0] ?? { kind: "default", deviceId: "", label: "Default" };
  const idx = routes.findIndex((r) => r.kind === current);
  return routes[(idx + 1) % routes.length]!;
}
