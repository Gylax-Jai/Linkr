/**
 * Call tones via Web Audio. Desktop: follows setSinkId (Sprint 3.1.7).
 * Mobile: softer gain — ringback may use loudspeaker until connect; call audio uses OS routing.
 */

import { isMobilePhone } from "./audioRoute";

type Pattern = "ringback" | "ringtone" | null;

let ctx: AudioContext | null = null;
let intervalId: number | null = null;
let current: Pattern = null;
let toneSinkId = "";

type SinkCtx = AudioContext & { setSinkId?: (id: string) => Promise<void> };

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Route call tones to the same output device as the call (desktop Chromium). */
export async function setCallToneSink(deviceId: string): Promise<boolean> {
  toneSinkId = deviceId;
  const audio = getCtx() as SinkCtx | null;
  if (!audio || typeof audio.setSinkId !== "function") return false;
  try {
    await audio.setSinkId(deviceId);
    return true;
  } catch {
    return false;
  }
}

async function applyToneSink(): Promise<void> {
  if (!toneSinkId) return;
  await setCallToneSink(toneSinkId);
}

/** Play one short blended tone with a soft attack/release envelope. */
function blip(freqs: number[], durationSec: number, gainPeak = 0.12): void {
  const audio = getCtx();
  if (!audio) return;
  void applyToneSink();
  const peak = isMobilePhone() ? Math.min(gainPeak, 0.07) : gainPeak;
  const now = audio.currentTime;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peak, now + 0.04);
  gain.gain.setValueAtTime(peak, now + durationSec - 0.05);
  gain.gain.linearRampToValueAtTime(0, now + durationSec);
  gain.connect(audio.destination);

  for (const f of freqs) {
    const osc = audio.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + durationSec);
  }
}

function clearLoop(): void {
  if (intervalId !== null) {
    window.clearInterval(intervalId);
    intervalId = null;
  }
}

export function startCallTone(pattern: Exclude<Pattern, null>): void {
  if (current === pattern) return;
  stopCallTone();
  current = pattern;
  getCtx();
  void applyToneSink();

  if (pattern === "ringback") {
    const tick = () => blip([440, 480], 1.0, 0.1);
    tick();
    intervalId = window.setInterval(tick, 3000);
  } else {
    const tick = () => {
      blip([587.33, 880], 0.4, 0.12);
      window.setTimeout(() => blip([587.33, 880], 0.4, 0.12), 500);
    };
    tick();
    intervalId = window.setInterval(tick, 2000);
  }
}

export function stopCallTone(): void {
  clearLoop();
  current = null;
}

export function playEndTone(): void {
  blip([480, 400], 0.25, 0.1);
}

export function resetCallToneSink(): void {
  toneSinkId = "";
}
