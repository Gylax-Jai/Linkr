import { LOCAL_MEDIA_PREFIX } from "../chat/chat.media.service.js";

/**
 * Public client route that streams a user's locally-stored avatar (Sprint 5.5). The client's axios
 * baseURL already includes `/api`, so DTO mappers return this path WITHOUT the `/api` prefix —
 * consistent with how chat media returns `/chat/media/:id`.
 */
export const AVATAR_ROUTE_PREFIX = "/users/avatar/";

/**
 * Derive a short, URL-safe cache-busting token from a stored avatar ref so the resolved URL
 * CHANGES whenever the photo changes (Sprint 5.10). A local ref is `local:<uuid><ext>` and the
 * uuid is regenerated on every upload, so a slice of it uniquely identifies the current photo.
 * Without this, `local:` refs collapse to the same stable `/users/avatar/<id>` URL, so the client
 * never refetches a freshly-uploaded avatar until a hard refresh.
 */
function avatarVersionFromRef(ref: string): string {
  return ref.slice(LOCAL_MEDIA_PREFIX.length).replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
}

/**
 * Resolve a stored avatar reference to something the client can use:
 *  - a `local:<uuid>` reference → the authenticated avatar route for that user, with a `?v=` token
 *    derived from the stored ref so the URL changes on every upload (the route ignores the query
 *    string, so matching is unaffected);
 *  - an absolute URL (Cloudinary / Google) → returned as-is (already changes per upload);
 *  - missing → undefined.
 */
export function resolveAvatarUrl(
  avatar: string | null | undefined,
  userId: string,
): string | undefined {
  if (!avatar) return undefined;
  if (avatar.startsWith(LOCAL_MEDIA_PREFIX)) {
    const base = `${AVATAR_ROUTE_PREFIX}${userId}`;
    const version = avatarVersionFromRef(avatar);
    return version ? `${base}?v=${version}` : base;
  }
  return avatar;
}
