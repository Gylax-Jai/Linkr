/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_GOOGLE_CLIENT_ID: string;
  /** Optional VAPID public key for Web Push (also available via GET /api/push/vapid-public-key). */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  /** MSG91 OTP widget id (public). When set with the token, onboarding uses real SMS OTP. */
  readonly VITE_MSG91_WIDGET_ID?: string;
  /** MSG91 OTP widget auth token (public, widget-scoped). */
  readonly VITE_MSG91_WIDGET_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
