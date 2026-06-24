import type { CallMedia } from "@linkr/shared";

/**
 * Quality-first call configuration (Sprint 3.1+). Centralizes capture constraints, codec
 * preferences and bitrate targets so audio/video quality is tuned in ONE place.
 *
 * Audio is tuned for clear, full-band voice: 48 kHz mono Opus with in-band FEC (packet-loss
 * resilience) and a generous average bitrate. Video constants are defined for Sprint 3.2.
 */

/** Target sender bitrates (bits per second). */
export const BITRATE = {
  /** Mono voice at 48 kHz — 64 kbps is transparent for speech with FEC headroom. */
  audio: 64_000,
  /** 720p default video target (Sprint 3.2). */
  video: 1_500_000,
} as const;

/** High-quality audio capture constraints (full-band Opus, DSP on for clean voice). */
export const audioConstraints: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  sampleRate: 48_000,
  sampleSize: 16,
};

/** HD video capture constraints (Sprint 3.2). 720p@30 with a 1080p ceiling. */
export const videoConstraints: MediaTrackConstraints = {
  width: { ideal: 1280, max: 1920 },
  height: { ideal: 720, max: 1080 },
  frameRate: { ideal: 30, max: 30 },
  facingMode: "user",
};

/** Build the `getUserMedia` constraints for a given call type. */
export function mediaConstraints(media: CallMedia): MediaStreamConstraints {
  return {
    audio: audioConstraints,
    video: media === "video" ? videoConstraints : false,
  };
}

/**
 * Munge an SDP to make Opus prefer quality: stereo off (mono voice), in-band FEC on for loss
 * resilience, DTX off to avoid clipping, and a high average bitrate. Safe no-op if no Opus line.
 */
export function tuneOpus(sdp: string): string {
  const lines = sdp.split(/\r?\n/);
  const opusLine = lines.find((l) => /^a=rtpmap:\d+ opus\/48000/i.test(l));
  if (!opusLine) return sdp;

  const payload = opusLine.match(/^a=rtpmap:(\d+)/)?.[1];
  if (!payload) return sdp;

  const fmtpIndex = lines.findIndex((l) => l.startsWith(`a=fmtp:${payload} `));
  const params = `stereo=0;sprop-stereo=0;useinbandfec=1;usedtx=0;maxaveragebitrate=${BITRATE.audio}`;

  if (fmtpIndex >= 0) {
    const fmtpLine = lines[fmtpIndex];
    if (!fmtpLine) return sdp;
    const existing = fmtpLine.slice(`a=fmtp:${payload} `.length);
    lines[fmtpIndex] = `a=fmtp:${payload} ${existing};${params}`;
  } else {
    const rtpmapIndex = lines.findIndex((l) => l.startsWith(`a=rtpmap:${payload} `));
    if (rtpmapIndex >= 0) {
      lines.splice(rtpmapIndex + 1, 0, `a=fmtp:${payload} ${params}`);
    }
  }
  return lines.join("\r\n");
}

/** Apply a target max bitrate to a sender's encoding parameters (audio or video). */
async function applyMaxBitrate(sender: RTCRtpSender, maxBitrate: number): Promise<void> {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    const encoding = params.encodings[0];
    if (encoding) encoding.maxBitrate = maxBitrate;
    await sender.setParameters(params);
  } catch {
    // Some browsers reject setParameters before negotiation; the SDP fmtp still applies.
  }
}

/** Apply the target max bitrate to an audio sender's encoding parameters. */
export async function applyAudioBitrate(sender: RTCRtpSender): Promise<void> {
  await applyMaxBitrate(sender, BITRATE.audio);
}

/** Apply the 720p target max bitrate to a video sender's encoding parameters (Sprint 3.2). */
export async function applyVideoBitrate(sender: RTCRtpSender): Promise<void> {
  await applyMaxBitrate(sender, BITRATE.video);
}
