import { env, features } from "./env.js";

/**
 * Google OAuth configuration (blueprint §3–§4). Reads credentials from env only — never
 * hardcoded. The actual OAuth flow (verify Google ID token → issue JWTs) lands in Sprint 1.
 */
export const oauthConfig = {
  enabled: features.googleAuth,
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  },
};
