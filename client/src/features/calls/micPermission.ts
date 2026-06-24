import { audioConstraints } from "./callConfig";

export type MicDenyReason = "insecure" | "denied" | "unavailable" | "unknown";

export type MicAccessResult =
  | { ok: true; stream: MediaStream }
  | { ok: false; reason: MicDenyReason };

/** User-facing copy when mic access fails (HTTPS, denied, or missing hardware). */
export function micAccessMessage(reason: MicDenyReason): string {
  switch (reason) {
    case "insecure":
      return "Voice calls need a secure (HTTPS) connection. Open Linkr over HTTPS or localhost.";
    case "denied":
      return "Microphone access is blocked. Allow the mic in your browser site settings, then try again.";
    case "unavailable":
      return "No microphone found. Connect a mic or check your device settings.";
    default:
      return "Microphone access is required to place a call.";
  }
}

/** Request microphone access with clear error reasons (secure context, denial, missing device). */
export async function requestMicAccess(): Promise<MicAccessResult> {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return { ok: false, reason: "insecure" };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, reason: "insecure" };
  }

  try {
    const perm = await navigator.permissions?.query?.({ name: "microphone" as PermissionName });
    if (perm?.state === "denied") {
      return { ok: false, reason: "denied" };
    }
  } catch {
    /* permissions API optional */
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    return { ok: true, stream };
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return { ok: false, reason: "denied" };
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return { ok: false, reason: "unavailable" };
    }
    return { ok: false, reason: "unknown" };
  }
}
