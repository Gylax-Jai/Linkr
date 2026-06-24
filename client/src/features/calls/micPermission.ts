import type { CallMedia } from "@linkr/shared";
import { audioConstraints, mediaConstraints } from "./callConfig";

export type MicDenyReason = "insecure" | "denied" | "unavailable" | "unknown";

export type MicAccessResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; reason: MicDenyReason };

/** User-facing copy when mic access fails (HTTPS, denied, or missing hardware). */
export function micAccessMessage(reason: MicDenyReason): string {
  return mediaAccessMessage(reason, "audio");
}

/** User-facing copy when call media access fails, tailored to voice vs video. */
export function mediaAccessMessage(reason: MicDenyReason, media: CallMedia): string {
  const isVideo = media === "video";
  switch (reason) {
    case "insecure":
      return isVideo
        ? "Video calls need a secure (HTTPS) connection. Open Linkr over HTTPS or localhost."
        : "Voice calls need a secure (HTTPS) connection. Open Linkr over HTTPS or localhost.";
    case "denied":
      return isVideo
        ? "Camera/microphone access is blocked. Allow them in your browser site settings, then try again."
        : "Microphone access is blocked. Allow the mic in your browser site settings, then try again.";
    case "unavailable":
      return isVideo
        ? "No camera or microphone found. Connect a device or check your settings."
        : "No microphone found. Connect a mic or check your device settings.";
    default:
      return isVideo
        ? "Camera and microphone access are required to place a video call."
        : "Microphone access is required to place a call.";
  }
}

function classifyMediaError(err: unknown): MicDenyReason {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "unavailable";
  return "unknown";
}

/** Request microphone access with clear error reasons (secure context, denial, missing device). */
export async function requestMicAccess(): Promise<MicAccessResult> {
  return requestCallMediaAccess("audio");
}

/**
 * Request the capture stream for a call. For voice this is mic-only; for video it is camera + mic.
 * Returns clear failure reasons (insecure context, permission denied, missing hardware) so the UI
 * can show actionable copy instead of a generic error.
 */
export async function requestCallMediaAccess(media: CallMedia): Promise<MicAccessResult> {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return { ok: false, reason: "insecure" };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: "insecure" };
  }

  // Best-effort early check (mic only — camera state varies by browser). Non-fatal if unsupported.
  try {
    const perm = await navigator.permissions?.query?.({ name: "microphone" as PermissionName });
    if (perm?.state === "denied") {
      return { ok: false, reason: "denied" };
    }
  } catch {
    /* permissions API optional */
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      media === "video" ? mediaConstraints("video") : { audio: audioConstraints },
    );
    return { ok: true, stream };
  } catch (err) {
    return { ok: false, reason: classifyMediaError(err) };
  }
}
