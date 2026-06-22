/**
 * MSG91 OTP widget loader (Phase 8 — real SMS OTP). Loads MSG91's `otp-provider.js` once and wraps
 * its imperative `window.sendOtp` / `window.verifyOtp` / `window.retryOtp` methods (exposed when the
 * widget is initialized with `exposeMethods: true`) as promises so the onboarding UI can drive them.
 *
 * Only the PUBLIC widget id + widget token are used here. The resulting access token is sent to our
 * server, which re-verifies it with the secret Authkey and reads the trusted phone number.
 */

const WIDGET_ID = import.meta.env.VITE_MSG91_WIDGET_ID;
const WIDGET_TOKEN = import.meta.env.VITE_MSG91_WIDGET_TOKEN;

const SCRIPT_URLS = [
  "https://verify.msg91.com/otp-provider.js",
  "https://verify.phone91.com/otp-provider.js",
];

/**
 * DOM id where MSG91 renders its captcha. When the widget has captcha enabled (MSG91's default),
 * `exposeMethods: true` only attaches sendOtp/verifyOtp once a captcha render target exists — without
 * this the methods never appear. PhoneStep renders a matching element; we also create one as a
 * fallback so initialization never blocks on a missing node.
 */
export const MSG91_CAPTCHA_CONTAINER_ID = "msg91-captcha";

function ensureCaptchaContainer(): void {
  if (document.getElementById(MSG91_CAPTCHA_CONTAINER_ID)) return;
  const el = document.createElement("div");
  el.id = MSG91_CAPTCHA_CONTAINER_ID;
  document.body.appendChild(el);
}

/** Whether MSG91 OTP is configured for this build (both public values present). */
export function isMsg91Enabled(): boolean {
  return Boolean(WIDGET_ID && WIDGET_TOKEN);
}

type OtpCallback = (data: unknown) => void;

interface Msg91Config {
  widgetId: string;
  tokenAuth: string;
  exposeMethods: boolean;
  captchaRenderId?: string;
  success?: OtpCallback;
  failure?: OtpCallback;
}

declare global {
  interface Window {
    initSendOTP?: (config: Msg91Config) => void;
    sendOtp?: (identifier: string, success?: OtpCallback, failure?: OtpCallback) => void;
    verifyOtp?: (otp: string, success?: OtpCallback, failure?: OtpCallback) => void;
    retryOtp?: (channel: string | null, success?: OtpCallback, failure?: OtpCallback) => void;
  }
}

let initPromise: Promise<void> | null = null;

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${url}`));
    document.head.appendChild(script);
  });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Poll until `window.sendOtp` / `verifyOtp` are attached. `initSendOTP` wires these up
 * asynchronously, so checking immediately after calling it races and yields "MSG91 not ready".
 */
async function waitForMethods(timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (typeof window.sendOtp === "function" && typeof window.verifyOtp === "function") return;
    await sleep(100);
  }
  throw new Error("MSG91 widget did not expose its methods (check widget id/token + domain settings)");
}

/** Load + initialize the widget once. Safe to call repeatedly. */
export function initMsg91(): Promise<void> {
  if (!isMsg91Enabled()) {
    return Promise.reject(new Error("MSG91 is not configured"));
  }
  if (initPromise) return initPromise;

  initPromise = (async () => {
    let loaded = false;
    let lastErr: unknown;
    for (const url of SCRIPT_URLS) {
      try {
        await loadScript(url);
        loaded = true;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!loaded) throw lastErr ?? new Error("Failed to load MSG91");

    if (typeof window.initSendOTP !== "function") {
      throw new Error("MSG91 widget script did not initialize");
    }

    // Captcha must have a render target BEFORE init, or methods are never exposed (see above).
    ensureCaptchaContainer();

    window.initSendOTP({
      widgetId: WIDGET_ID as string,
      tokenAuth: WIDGET_TOKEN as string,
      exposeMethods: true,
      captchaRenderId: MSG91_CAPTCHA_CONTAINER_ID,
      success: (data) => console.info("[MSG91] init success", data),
      failure: (err) => console.error("[MSG91] init failure", err),
    });

    // initSendOTP attaches sendOtp/verifyOtp asynchronously — wait for them before resolving.
    await waitForMethods();
  })().catch((err) => {
    // Let a later attempt retry instead of caching a failed init forever.
    initPromise = null;
    throw err;
  });

  return initPromise;
}

/** Extract the JWT access token MSG91 returns on a successful verify (string or wrapped object). */
function readAccessToken(data: unknown): string | null {
  if (typeof data === "string") return data.trim() || null;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["message", "access_token", "accessToken", "token"]) {
      const value = obj[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return null;
}

/** Best-effort human message out of MSG91's loosely-typed error payloads (logged raw for debugging). */
function msg91ErrorMessage(err: unknown, fallback: string): string {
  // Surface the raw payload so the real reason (domain not whitelisted, bad token, no credits, …)
  // is visible in the console — the UI only ever shows a short, friendly line.
  console.error("[MSG91]", err);
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const obj = err as Record<string, unknown>;
    for (const key of ["message", "msg", "error", "type"]) {
      const value = obj[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return fallback;
}

/** Send an OTP to a phone in E.164 (`+9198...`). MSG91 wants the identifier WITHOUT the leading `+`. */
export async function sendMsg91Otp(phoneE164: string): Promise<void> {
  await initMsg91();
  const identifier = phoneE164.replace(/^\+/, "");
  return new Promise((resolve, reject) => {
    if (typeof window.sendOtp !== "function") {
      reject(new Error("MSG91 not ready"));
      return;
    }
    window.sendOtp(
      identifier,
      () => resolve(),
      (err) => reject(new Error(msg91ErrorMessage(err, "Could not send the code"))),
    );
  });
}

/** Verify the entered OTP; resolves with the JWT access token to hand to our server. */
export async function verifyMsg91Otp(code: string): Promise<string> {
  await initMsg91();
  return new Promise((resolve, reject) => {
    if (typeof window.verifyOtp !== "function") {
      reject(new Error("MSG91 not ready"));
      return;
    }
    window.verifyOtp(
      code,
      (data) => {
        const token = readAccessToken(data);
        if (token) resolve(token);
        else reject(new Error("Verification succeeded but no token was returned"));
      },
      (err) => reject(new Error(msg91ErrorMessage(err, "Incorrect or expired code"))),
    );
  });
}
