/**
 * Call tones synthesized with the Web Audio API (Sprint 3.1.1) — no audio asset files to ship.
 *  - Ringback: the repeating tone the CALLER hears while waiting for an answer.
 *  - Ringtone: the repeating tone the CALLEE hears for an incoming call.
 *  - End tone: a short blip when a call ends.
 *
 * One pattern plays at a time. Browsers suspend AudioContext until a user gesture, so we resume on
 * demand; the call/accept button click satisfies the gesture in practice.
 */

type Pattern = "ringback" | "ringtone" | null;

let ctx: AudioContext | null = null;
let intervalId: number | null = null;
let current: Pattern = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Play one short blended tone (two frequencies) with a soft attack/release envelope. */
function blip(freqs: number[], durationSec: number, gainPeak = 0.12): void {
  const audio = getCtx();
  if (!audio) return;
  const now = audio.currentTime;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(gainPeak, now + 0.04);
  gain.gain.setValueAtTime(gainPeak, now + durationSec - 0.05);
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

/**
 * Start a looping call pattern. Ringback ≈ classic 440/480 Hz ~1s tone every 3s; ringtone is a
 * brighter double-blip every ~2s. Calling twice with the same pattern is a no-op.
 */
export function startCallTone(pattern: Exclude<Pattern, null>): void {
  if (current === pattern) return;
  stopCallTone();
  current = pattern;
  getCtx();

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

/** Stop any looping tone. */
export function stopCallTone(): void {
  clearLoop();
  current = null;
}

/** A short end-of-call blip. */
export function playEndTone(): void {
  blip([480, 400], 0.25, 0.1);
}
