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

function classify(label: string): AudioRouteKind {
  const l = label.toLowerCase();
  if (/bluetooth|airpod|buds|wireless|\bbt\b/.test(l)) return "bluetooth";
  if (/head(set|phone)|earphone|wired|earpods|usb audio/.test(l)) return "headset";
  if (/speaker|loud/.test(l)) return "speaker";
  if (/earpiece|receiver/.test(l)) return "earpiece";
  return "default";
}

/**
 * Enumerate audio-output devices and map them to call routes. Best-effort: labels are only populated
 * after a getUserMedia permission grant (which a call already obtains). De-dupes by kind, keeping the
 * first device of each kind.
 */
export async function listAudioRoutes(): Promise<AudioRoute[]> {
  if (!canSwitchOutput() || !navigator.mediaDevices?.enumerateDevices) {
    return [{ kind: "default", deviceId: "", label: "Default" }];
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter((d) => d.kind === "audiooutput");
    const seen = new Set<AudioRouteKind>();
    const routes: AudioRoute[] = [];

    for (const d of outputs) {
      // The literal "default"/"communications" pseudo-devices map to the OS default route.
      const kind = d.deviceId === "default" || d.deviceId === "communications" ? "default" : classify(d.label);
      if (seen.has(kind)) continue;
      seen.add(kind);
      routes.push({ kind, deviceId: d.deviceId, label: d.label || kind });
    }

    if (routes.length === 0) routes.push({ kind: "default", deviceId: "", label: "Default" });
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
