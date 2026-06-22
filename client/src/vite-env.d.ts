/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_GOOGLE_CLIENT_ID: string;
  /** MSG91 OTP widget id (public). When set with the token, onboarding uses real SMS OTP. */
  readonly VITE_MSG91_WIDGET_ID?: string;
  /** MSG91 OTP widget auth token (public, widget-scoped). */
  readonly VITE_MSG91_WIDGET_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
