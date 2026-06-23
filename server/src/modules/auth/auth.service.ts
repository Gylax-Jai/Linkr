import { OAuth2Client } from "google-auth-library";
import type { HydratedDocument } from "mongoose";
import type { SessionUser } from "@linkr/shared";
import { env } from "../../config/env.js";
import { UserModel, type UserDoc } from "../../models/User.js";
import { ApiError } from "../../utils/ApiError.js";
import { resolveAvatarUrl } from "../users/avatar.helpers.js";

/** Auth service: Google ID-token verification, find-or-create, and the safe session mapper. */

export type UserDocument = HydratedDocument<UserDoc>;

// One reusable verifier; created lazily so the server still boots without GOOGLE_CLIENT_ID.
let googleClient: OAuth2Client | null = null;
function getGoogleClient(): OAuth2Client {
  if (!env.GOOGLE_CLIENT_ID) {
    throw ApiError.internal("Google login is not configured (set GOOGLE_CLIENT_ID)");
  }
  if (!googleClient) {
    googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  }
  return googleClient;
}

interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
}

/** Verify a Google Identity Services ID token and extract the profile we care about. */
async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const client = getGoogleClient();
  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    throw ApiError.unauthorized("Google sign-in failed");
  }

  if (!payload?.sub || !payload.email) {
    throw ApiError.unauthorized("Google sign-in failed");
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name?.trim() || payload.email.split("@")[0] || "Linkr User",
    picture: payload.picture,
  };
}

/**
 * Verify the Google credential, then find-or-create the matching user. Existing accounts are
 * matched by googleId first, then by email (linking a returning user). New users start
 * un-onboarded, seeded with the Google name + picture.
 */
export async function loginWithGoogle(idToken: string): Promise<UserDocument> {
  const profile = await verifyGoogleIdToken(idToken);

  let user = await UserModel.findOne({ googleId: profile.googleId });
  if (!user) {
    user = await UserModel.findOne({ email: profile.email });
    if (user && !user.googleId) {
      user.googleId = profile.googleId;
    }
  }

  if (!user) {
    user = await UserModel.create({
      googleId: profile.googleId,
      email: profile.email,
      displayName: profile.name,
      avatar: profile.picture,
      onboarded: false,
    });
  } else {
    // Keep avatar fresh from Google only while the user hasn't set their own profile yet.
    if (!user.onboarded && profile.picture && !user.avatar) {
      user.avatar = profile.picture;
    }
    await user.save();
  }

  return user;
}

export async function getUserById(id: string): Promise<UserDocument | null> {
  return UserModel.findById(id);
}

/** Map a user document to the client-safe session view (never includes phone fields). */
export function toSessionUser(user: UserDocument): SessionUser {
  // Treat an expired custom status as cleared so the owner's own UI also stops showing it (Sprint C.1).
  const statusExpiresAt = user.statusExpiresAt instanceof Date ? user.statusExpiresAt : undefined;
  const statusExpired = Boolean(statusExpiresAt && statusExpiresAt.getTime() <= Date.now());
  const status = statusExpired ? undefined : (user.status ?? undefined);

  return {
    _id: user.id,
    email: user.email,
    username: user.username ?? undefined,
    displayName: user.displayName,
    avatar: resolveAvatarUrl(user.avatar, user.id),
    bio: user.bio ?? undefined,
    status,
    statusExpiresAt: statusExpired ? undefined : statusExpiresAt?.toISOString(),
    onboarded: Boolean(user.onboarded),
    phoneVerified: Boolean(user.phoneVerified),
    privacy: {
      lastSeen: user.privacy?.lastSeen ?? "friends",
      profile: user.privacy?.profile ?? "everyone",
      whoCanRequest: user.privacy?.whoCanRequest ?? "everyone",
    },
    createdAt: (user.createdAt instanceof Date ? user.createdAt : new Date()).toISOString(),
  };
}
