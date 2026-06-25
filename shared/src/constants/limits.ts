/** Shared validation limits and enum value lists (single source of truth for client + server). */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
/** Letters, numbers and underscore only (blueprint §4). */
export const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

export const DISPLAY_NAME_MAX = 50;
export const BIO_MAX = 200;
export const STATUS_MAX = 50;

/**
 * E.164 phone format (blueprint §4): leading "+", country code 1–9, up to 14 more digits.
 * Used for OTP verification; the raw number is never persisted in plaintext server-side.
 */
export const PHONE_E164_REGEX = /^\+[1-9]\d{6,14}$/;

/** OTP rules (blueprint §4, §12). Codes are stored hashed only, with a short TTL. */
export const OTP_CODE_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60_000; // 5 minutes
export const OTP_MAX_ATTEMPTS = 5; // lock verification after this many wrong tries
export const OTP_RESEND_COOLDOWN_MS = 30_000; // min gap between resend requests per phone

export const FRIENDSHIP_STATUSES = ["pending", "accepted", "rejected", "blocked"] as const;
export const MESSAGE_TYPES = ["text", "image", "video", "file", "voice", "call", "poll"] as const;
/** Group poll limits (Phase 7A). */
export const POLL_QUESTION_MAX = 300;
export const POLL_OPTION_TEXT_MAX = 100;
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 4;
export const MESSAGE_STATUSES = ["sent", "delivered", "read"] as const;
export const CHAT_TYPES = ["1:1", "group", "self"] as const;
export const GROUP_MAX_MEMBERS = 16;
export const GROUP_NAME_MAX = 50;
/** Who may send messages in a group (Phase 6). Default: everyone. */
export const GROUP_MESSAGE_PERMISSION_VALUES = ["everyone", "admins"] as const;
/** Chat attachments (Cloudinary / local) are purged this many days after upload. */
export const MEDIA_RETENTION_DAYS = 30;
export const VISIBILITY_VALUES = ["everyone", "friends", "nobody"] as const;
/** Profile bio/status/avatar visibility: everyone, friends only, or hidden. */
export const PROFILE_VISIBILITY_VALUES = ["everyone", "friends", "nobody"] as const;

/**
 * Account deletion (Phase 4). A "scheduled" (soft) deletion deactivates the account immediately and
 * permanently purges it after this many days unless the owner logs back in to reactivate. An
 * "immediate" deletion purges everything right away with no grace period.
 */
export const ACCOUNT_DELETION_GRACE_DAYS = 15;
export const ACCOUNT_STATUSES = ["active", "deactivated"] as const;

/** In-app notification kinds (Sprint 5). */
export const NOTIFICATION_TYPES = ["friend_request", "friend_accepted", "message"] as const;
/** Max notifications returned by GET /api/notifications (newest first). */
export const NOTIFICATION_LIST_LIMIT = 30;

/**
 * Media upload limits (Sprint 5). Enforced server-side BEFORE processing; shared so the
 * client can pre-check and surface the same caps. Media is encrypted in transit only (not E2EE).
 */
export const MEDIA_IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10 MB for images
export const MEDIA_FILE_MAX_BYTES = 25 * 1024 * 1024; // 25 MB for other files
/** Caption length cap for a media message (optional text alongside an attachment). */
export const MEDIA_CAPTION_MAX = 2000;
/** `accept` hint for the file picker (not a security control — the server allowlists by magic bytes). */
export const MEDIA_ACCEPT =
  "image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/zip";
/** Human-readable list of accepted attachment types (shared by the server error + client hint). */
export const MEDIA_ACCEPT_LABEL =
  "images (PNG, JPG, GIF, WEBP), PDF, TXT, ZIP, DOC, DOCX, XLS, XLSX, PPT, PPTX";

/**
 * Avatar (profile photo) upload limits (Sprint 5.5). Images only, with a tighter cap than chat
 * media. Reuses the same magic-byte hardening + random-filename storage as chat media.
 */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
/** `accept` hint for the avatar file picker (images only). */
export const AVATAR_ACCEPT = "image/png,image/jpeg,image/gif,image/webp";
