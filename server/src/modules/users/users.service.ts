import path from "node:path";
import type { OnboardingInput, PrivacyUpdateInput, ProfileUpdateInput, UserSearchResult } from "@linkr/shared";
import { UserModel } from "../../models/User.js";
import { ApiError } from "../../utils/ApiError.js";
import type { UserDocument } from "../auth/auth.service.js";
import {
  imageMimeForExt,
  LOCAL_MEDIA_PREFIX,
  resolveLocalMediaPath,
} from "../chat/chat.media.service.js";
import { findFriendshipBetween } from "../friends/friendship.helpers.js";
import { resolveAvatarUrl } from "./avatar.helpers.js";

/** Users service: username availability + onboarding completion (blueprint §4). */

/** Mongo duplicate-key error guard (used to translate a unique-index race into 409). */
function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

/** Case-insensitive availability check (usernames are unique regardless of casing). */
export async function isUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean> {
  const filter: Record<string, unknown> = { username: new RegExp(`^${username}$`, "i") };
  if (excludeUserId) {
    filter._id = { $ne: excludeUserId };
  }
  const existing = await UserModel.exists(filter);
  return existing === null;
}

/**
 * Complete onboarding: requires a verified phone (from the OTP step), enforces username
 * uniqueness, and saves the profile. Returns the updated user document.
 */
export async function completeOnboarding(user: UserDocument, input: OnboardingInput): Promise<UserDocument> {
  if (!user.phoneVerified) {
    throw new ApiError(400, "PHONE_NOT_VERIFIED", "Verify your phone number before finishing onboarding");
  }

  if (!(await isUsernameAvailable(input.username, user.id))) {
    throw new ApiError(409, "USERNAME_TAKEN", "That username is already taken");
  }

  user.username = input.username;
  user.displayName = input.displayName;
  user.bio = input.bio;
  user.status = input.status;
  if (input.avatar) {
    user.avatar = input.avatar;
  }
  user.onboarded = true;

  try {
    await user.save();
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new ApiError(409, "USERNAME_TAKEN", "That username is already taken");
    }
    throw err;
  }

  return user;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPublicUser(doc: {
  _id: { toString(): string };
  username?: string | null;
  displayName: string;
  avatar?: string | null;
}) {
  return {
    _id: doc._id.toString(),
    username: doc.username ?? undefined,
    displayName: doc.displayName,
    avatar: resolveAvatarUrl(doc.avatar, doc._id.toString()),
  };
}

/** Privacy-limited username search (blueprint §5). Strangers receive PublicUser fields only. */
export async function searchUsersByUsername(
  query: string,
  searcherId: string,
): Promise<UserSearchResult[]> {
  const term = query.replace(/^@/, "").trim();
  if (!term) return [];

  const regex = new RegExp(escapeRegex(term), "i");
  const users = await UserModel.find({
    username: regex,
    onboarded: true,
    _id: { $ne: searcherId },
  })
    .limit(20)
    .select("_id username displayName avatar");

  const results: UserSearchResult[] = [];

  for (const user of users) {
    const friendship = await findFriendshipBetween(searcherId, user.id);
    const base = toPublicUser(user);

    if (!friendship) {
      results.push(base);
      continue;
    }

    const requesterId = friendship.requester.toString();
    const direction = requesterId === searcherId ? "outgoing" : "incoming";

    if (friendship.status === "blocked") {
      // If the OTHER user blocked the searcher, keep them hidden. If the searcher is the blocker,
      // surface the row (flagged) so they can unblock from search.
      const blockedByMe = friendship.actionBy.toString() === searcherId;
      if (!blockedByMe) continue;
      results.push({
        ...base,
        friendship: { id: friendship._id.toString(), status: "blocked", direction, blockedByMe: true },
      });
      continue;
    }

    results.push({
      ...base,
      friendship: {
        id: friendship._id.toString(),
        status: friendship.status,
        direction,
      },
    });
  }

  return results;
}

/** Update privacy settings for the authenticated user. */
export async function updatePrivacy(user: UserDocument, input: PrivacyUpdateInput): Promise<UserDocument> {
  if (!user.privacy) {
    user.privacy = {
      lastSeen: "friends",
      profile: "everyone",
      whoCanRequest: "everyone",
    };
  }
  if (input.lastSeen !== undefined) {
    user.privacy.lastSeen = input.lastSeen;
  }
  if (input.profile !== undefined) {
    user.privacy.profile = input.profile;
  }
  if (input.whoCanRequest !== undefined) {
    user.privacy.whoCanRequest = input.whoCanRequest;
  }
  await user.save();
  return user;
}

/** Update profile fields (displayName, bio, status — username is immutable). */
export async function updateProfile(user: UserDocument, input: ProfileUpdateInput): Promise<UserDocument> {
  if (input.displayName !== undefined) {
    user.displayName = input.displayName;
  }
  if (input.bio !== undefined) {
    user.bio = input.bio;
  }
  if (input.status !== undefined) {
    user.status = input.status;
    // Recompute expiry whenever the status text changes (Sprint C.1). A cleared status drops the
    // expiry; `statusDurationHours` of null (or absent) means "never expire".
    if (!input.status.trim()) {
      user.statusExpiresAt = undefined;
    } else if (input.statusDurationHours != null) {
      user.statusExpiresAt = new Date(Date.now() + input.statusDurationHours * 60 * 60 * 1000);
    } else {
      user.statusExpiresAt = undefined;
    }
  }
  await user.save();
  return user;
}

/**
 * Set the user's avatar to a stored reference (Sprint 5.5). `ref` is the value returned by
 * `storeMedia` — a Cloudinary secure URL or an internal `local:<uuid>` reference.
 */
export async function setUserAvatar(user: UserDocument, ref: string): Promise<UserDocument> {
  user.avatar = ref;
  await user.save();
  return user;
}

/**
 * Resolve a user's locally-stored avatar to a file path + MIME for the authenticated serve route.
 * Returns null for absent or non-local (Cloudinary) avatars, or if the file is missing.
 */
export async function getLocalAvatar(userId: string): Promise<{ filePath: string; mime: string } | null> {
  const user = await UserModel.findById(userId).select("avatar");
  const ref = user?.avatar;
  if (!ref || !ref.startsWith(LOCAL_MEDIA_PREFIX)) return null;

  const filePath = await resolveLocalMediaPath(ref);
  if (!filePath) return null;

  return { filePath, mime: imageMimeForExt(path.extname(ref)) };
}
