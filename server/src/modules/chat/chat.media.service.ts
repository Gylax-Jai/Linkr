import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import type { MessageType } from "@linkr/shared";
import {
  AVATAR_MAX_BYTES,
  MEDIA_ACCEPT_LABEL,
  MEDIA_FILE_MAX_BYTES,
  MEDIA_IMAGE_MAX_BYTES,
} from "@linkr/shared";
import { cloudinaryConfig } from "../../config/cloudinary.js";
import { ApiError } from "../../utils/ApiError.js";
import { logger } from "../../utils/logger.js";

/**
 * Media upload handling (Sprint 5). Media is encrypted in transit only (NOT end-to-end) — the
 * server handles plaintext bytes, consistent with text messages today.
 *
 * Hardening (per repo file-upload rules):
 *  - Allowlist by extension AND magic-byte content sniffing (the client Content-Type is ignored).
 *  - Size caps enforced before storage (images ≤ 10MB, other files ≤ 25MB).
 *  - Random UUID storage filename — the user-supplied name is kept only as display metadata.
 *  - Stored OUTSIDE the web root (server/uploads), served via an authenticated, membership-checked
 *    route only. Uploads are never executed.
 *  - When Cloudinary is configured, the buffer goes there instead (resource_type auto).
 */

/** Internal DB marker for a locally-stored file (resolved to an authenticated route in the DTO). */
export const LOCAL_MEDIA_PREFIX = "local:";

const here = path.dirname(fileURLToPath(import.meta.url));
// server/src/modules/chat → server/uploads (outside client/web root).
const UPLOAD_DIR = path.resolve(here, "../../../uploads");

type Kind = "image" | "file";

interface MediaRule {
  /** Canonical, server-trusted MIME type (never derived from the client's header). */
  mime: string;
  kind: Kind;
  /** Magic-byte verifier; returns true for formats without a reliable signature (e.g. text). */
  match: (buf: Buffer) => boolean;
}

function startsWith(buf: Buffer, sig: number[], offset = 0): boolean {
  if (buf.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i += 1) {
    if (buf[offset + i] !== sig[i]) return false;
  }
  return true;
}

const isPng = (b: Buffer) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]);
const isJpeg = (b: Buffer) => startsWith(b, [0xff, 0xd8, 0xff]);
const isGif = (b: Buffer) => startsWith(b, [0x47, 0x49, 0x46, 0x38]);
const isWebp = (b: Buffer) =>
  startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8);
const isPdf = (b: Buffer) => startsWith(b, [0x25, 0x50, 0x44, 0x46]);
const isZip = (b: Buffer) =>
  startsWith(b, [0x50, 0x4b, 0x03, 0x04]) ||
  startsWith(b, [0x50, 0x4b, 0x05, 0x06]) ||
  startsWith(b, [0x50, 0x4b, 0x07, 0x08]);
const isOle = (b: Buffer) => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const always = () => true;

/** Extension → rule allowlist (anything not listed is rejected). */
const RULES: Record<string, MediaRule> = {
  ".png": { mime: "image/png", kind: "image", match: isPng },
  ".jpg": { mime: "image/jpeg", kind: "image", match: isJpeg },
  ".jpeg": { mime: "image/jpeg", kind: "image", match: isJpeg },
  ".gif": { mime: "image/gif", kind: "image", match: isGif },
  ".webp": { mime: "image/webp", kind: "image", match: isWebp },
  ".pdf": { mime: "application/pdf", kind: "file", match: isPdf },
  ".txt": { mime: "text/plain", kind: "file", match: always },
  ".zip": { mime: "application/zip", kind: "file", match: isZip },
  ".doc": { mime: "application/msword", kind: "file", match: isOle },
  ".docx": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "file",
    match: isZip,
  },
  ".xls": { mime: "application/vnd.ms-excel", kind: "file", match: isOle },
  ".xlsx": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    kind: "file",
    match: isZip,
  },
  ".ppt": { mime: "application/vnd.ms-powerpoint", kind: "file", match: isOle },
  ".pptx": {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    kind: "file",
    match: isZip,
  },
};

/**
 * Sanitize the user-supplied filename for safe DISPLAY (never used for storage): strip any path,
 * restrict to a safe character set, and block leading dots/dashes (hidden/option-like names).
 */
export function sanitizeFilename(name: string): string {
  const base = path.basename(name);
  const cleaned = base
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/^[.\-\s]+/, "")
    .trim();
  const limited = cleaned.slice(0, 120);
  return limited.length > 0 ? limited : "file";
}

export interface ValidatedMedia {
  /** MessageType for the resulting message (image or file). */
  type: MessageType;
  /** Canonical server-trusted MIME. */
  mime: string;
  ext: string;
  displayName: string;
}

/**
 * Validate an uploaded buffer by allowlisted extension, size cap, and magic-byte content.
 * Throws an ApiError (4xx) on any violation. The error text names the accepted types so users
 * understand what went wrong (e.g. an unsupported pick or a content/extension mismatch).
 */
export function validateUpload(originalName: string, buffer: Buffer): ValidatedMedia {
  const displayName = sanitizeFilename(originalName);
  const ext = path.extname(displayName).toLowerCase();
  const rule = RULES[ext];
  if (!rule) {
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      `This file type isn't supported. Accepted types: ${MEDIA_ACCEPT_LABEL}.`,
    );
  }
  if (buffer.length === 0) {
    throw ApiError.badRequest("This file is empty — nothing to upload.");
  }
  const cap = rule.kind === "image" ? MEDIA_IMAGE_MAX_BYTES : MEDIA_FILE_MAX_BYTES;
  if (buffer.length > cap) {
    const mb = Math.round(cap / (1024 * 1024));
    throw new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      `This file is too large. The maximum for ${rule.kind === "image" ? "images" : "files"} is ${mb} MB.`,
    );
  }
  if (!rule.match(buffer)) {
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "This file's contents don't match its extension, so it was rejected.",
    );
  }
  return { type: rule.kind === "image" ? "image" : "file", mime: rule.mime, ext, displayName };
}

/**
 * Validate an avatar (profile photo) upload — images only, with a tighter 5 MB cap. Reuses the
 * same magic-byte hardening as chat media so a renamed/forged file is rejected with a clean 4xx.
 */
export function validateAvatarUpload(originalName: string, buffer: Buffer): ValidatedMedia {
  const displayName = sanitizeFilename(originalName);
  const ext = path.extname(displayName).toLowerCase();
  const rule = RULES[ext];
  if (!rule || rule.kind !== "image") {
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Your profile photo must be a PNG, JPG, GIF, or WEBP image.",
    );
  }
  if (buffer.length === 0) {
    throw ApiError.badRequest("This image is empty — nothing to upload.");
  }
  if (buffer.length > AVATAR_MAX_BYTES) {
    const mb = Math.round(AVATAR_MAX_BYTES / (1024 * 1024));
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", `Your profile photo must be ${mb} MB or smaller.`);
  }
  if (!rule.match(buffer)) {
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "This image's contents don't match its extension, so it was rejected.",
    );
  }
  return { type: "image", mime: rule.mime, ext, displayName };
}

/** Best-effort MIME lookup from an allowlisted extension (used when serving stored avatars). */
export function imageMimeForExt(ext: string): string {
  const rule = RULES[ext.toLowerCase()];
  return rule?.kind === "image" ? rule.mime : "application/octet-stream";
}

async function ensureUploadDir(): Promise<void> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

let cloudinaryConfigured = false;

export function ensureCloudinaryConfigured(): void {
  if (!cloudinaryConfig.enabled || cloudinaryConfigured) return;
  cloudinary.config({ secure: true });
  cloudinaryConfigured = true;
}

/** Result of storing an uploaded attachment (URL + optional Cloudinary id for lifecycle deletes). */
export interface StoredMediaRef {
  url: string;
  cloudinaryPublicId?: string;
  /** Byte size of the stored payload (after compression). */
  size: number;
}

const IMAGE_MAX_DIMENSION = 2048;
const JPEG_QUALITY = 85;

/**
 * Compress raster images before upload (PNG/JPG/WEBP). GIFs are left as-is to preserve animation.
 * Falls back to the original buffer if jimp is unavailable or processing fails.
 */
async function compressImageBuffer(
  media: ValidatedMedia,
  buffer: Buffer,
): Promise<{ buffer: Buffer; mime: string }> {
  if (media.type !== "image" || media.ext === ".gif") {
    return { buffer, mime: media.mime };
  }
  try {
    const { Jimp } = await import("jimp");
    const img = await Jimp.read(buffer);
    const w = img.width;
    const h = img.height;
    if (w > IMAGE_MAX_DIMENSION || h > IMAGE_MAX_DIMENSION) {
      img.scaleToFit({ w: IMAGE_MAX_DIMENSION, h: IMAGE_MAX_DIMENSION });
    }
    if (media.ext === ".png") {
      return { buffer: await img.getBuffer("image/png"), mime: "image/png" };
    }
    if (media.ext === ".webp") {
      return { buffer: await img.getBuffer("image/jpeg", { quality: JPEG_QUALITY }), mime: "image/jpeg" };
    }
    return { buffer: await img.getBuffer("image/jpeg", { quality: JPEG_QUALITY }), mime: "image/jpeg" };
  } catch (err) {
    logger.warn("Image compression skipped", { err: err instanceof Error ? err.message : String(err) });
    return { buffer, mime: media.mime };
  }
}

/** Best-effort public_id extraction from a legacy Cloudinary secure URL (for purge of old rows). */
export function extractCloudinaryPublicId(url: string): string | undefined {
  if (!url.startsWith("http") || !url.includes("cloudinary.com")) return undefined;
  const marker = "/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1) return undefined;
  let tail = url.slice(idx + marker.length);
  tail = tail.replace(/^v\d+\//, "");
  const dot = tail.lastIndexOf(".");
  if (dot > tail.lastIndexOf("/")) tail = tail.slice(0, dot);
  return tail || undefined;
}

/** Delete a stored attachment from Cloudinary or local disk. */
export async function deleteStoredMedia(mediaRef: string, cloudinaryPublicId?: string): Promise<void> {
  if (mediaRef.startsWith(LOCAL_MEDIA_PREFIX)) {
    const filePath = await resolveLocalMediaPath(mediaRef);
    if (filePath) await fs.unlink(filePath).catch(() => {});
    return;
  }
  if (!cloudinaryConfig.enabled) return;
  const publicId = cloudinaryPublicId ?? extractCloudinaryPublicId(mediaRef);
  if (!publicId) return;
  ensureCloudinaryConfigured();
  await cloudinary.uploader.destroy(publicId, { resource_type: "auto" }).catch((err) => {
    logger.warn("Cloudinary destroy failed", { publicId, err: err instanceof Error ? err.message : String(err) });
  });
}

/**
 * Store the validated buffer. Returns the internal DB reference for `mediaUrl`:
 *  - Cloudinary enabled → the returned absolute secure URL (public).
 *  - Otherwise → `local:<uuid><ext>`, resolved to an authenticated download route in the DTO.
 */
export async function storeMedia(media: ValidatedMedia, buffer: Buffer): Promise<StoredMediaRef> {
  const { buffer: payload, mime } = await compressImageBuffer(media, buffer);
  const storedMedia: ValidatedMedia = media.type === "image" ? { ...media, mime } : media;

  if (cloudinaryConfig.enabled) {
    ensureCloudinaryConfigured();
    const isGif = storedMedia.ext === ".gif";
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: "auto",
          folder: "linkr",
          quality: "auto:good",
          // fetch_format:auto converts animated GIFs to static WebP/JPEG — skip for GIF uploads.
          ...(isGif ? {} : { fetch_format: "auto" as const }),
        },
        (error, res) => {
          if (error || !res) reject(error ?? new Error("Cloudinary upload failed"));
          else resolve(res);
        },
      );
      stream.end(payload);
    });
    return { url: result.secure_url, cloudinaryPublicId: result.public_id, size: payload.length };
  }

  // Local-disk fallback (dev): random UUID filename, outside the web root.
  const filename = `${randomUUID()}${storedMedia.ext}`;
  try {
    await ensureUploadDir();
    await fs.writeFile(path.join(UPLOAD_DIR, filename), payload);
  } catch (err) {
    logger.error("Failed to store uploaded file", {
      err: err instanceof Error ? err.message : String(err),
    });
    throw ApiError.internal("We couldn't save your file. Please try again.");
  }
  return { url: `${LOCAL_MEDIA_PREFIX}${filename}`, size: payload.length };
}

/**
 * Resolve a `local:` reference to an absolute file path inside the uploads dir, or null if it is
 * not a local reference / not a safe filename / missing. Guards against path traversal.
 */
export async function resolveLocalMediaPath(mediaRef: string): Promise<string | null> {
  if (!mediaRef.startsWith(LOCAL_MEDIA_PREFIX)) return null;
  const filename = mediaRef.slice(LOCAL_MEDIA_PREFIX.length);
  // Only a bare UUID-style filename with a simple extension is ever valid.
  if (!/^[a-f0-9-]+\.[a-zA-Z0-9]+$/.test(filename)) return null;
  const full = path.resolve(UPLOAD_DIR, filename);
  if (full !== path.join(UPLOAD_DIR, filename) || !full.startsWith(UPLOAD_DIR + path.sep)) {
    return null;
  }
  try {
    await fs.access(full);
    return full;
  } catch {
    logger.warn("Local media file missing", { filename });
    return null;
  }
}
