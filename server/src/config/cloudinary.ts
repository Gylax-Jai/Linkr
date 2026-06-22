import { env } from "./env.js";

/**
 * Cloudinary configuration (blueprint §3). Media is encrypted on-device BEFORE upload
 * (E2EE, blueprint §9); the server only ever handles opaque ciphertext blobs. Wired in Sprint 5.
 */
export const cloudinaryConfig = {
  enabled: typeof env.CLOUDINARY_URL === "string" && env.CLOUDINARY_URL.trim().length > 0,
  url: env.CLOUDINARY_URL,
};
