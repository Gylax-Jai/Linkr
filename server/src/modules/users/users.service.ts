import path from "node:path";
import type {
  OnboardingInput,
  PrivacyUpdateInput,
  ProfileUpdateInput,
  ReportUserInput,
  UserSearchResult,
} from "@linkr/shared";
import { UserModel } from "../../models/User.js";
import { ReportModel } from "../../models/Report.js";
import { ApiError } from "../../utils/ApiError.js";
import type { UserDocument } from "../auth/auth.service.js";
import {
  imageMimeForExt,
  LOCAL_MEDIA_PREFIX,
  resolveLocalMediaPath,
} from "../chat/chat.media.service.js";
import { findFriendshipBetween } from "../friends/friendship.helpers.js";
import {
  canViewAvatarThumbnail,
  canViewLastSeen,
  canViewProfileDetails,
  canZoomAvatar,
} from "./privacy.helpers.js";
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
  user.e2eeSetupPromptPending = true;

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

function activeStatus(status?: string | null, expiresAt?: Date | null): string | undefined {
  const text = status?.trim();
  if (!text) return undefined;
  if (expiresAt && expiresAt.getTime() <= Date.now()) return undefined;
  return text;
}

type UserProfileDoc = {
  _id: { toString(): string };
  username?: string | null;
  displayName: string;
  avatar?: string | null;
  bio?: string | null;
  status?: string | null;
  statusExpiresAt?: Date | null;
  online?: boolean | null;
  lastSeen?: Date | null;
  privacy?: { lastSeen?: string | null; profile?: string | null; whoCanRequest?: string | null } | null;
};

function buildUserProfileView(
  user: UserProfileDoc,
  searcherId: string,
  friendship: Awaited<ReturnType<typeof findFriendshipBetween>>,
): UserSearchResult {
  const viewerIsFriend = friendship?.status === "accepted";
  const avatarVisible = canViewAvatarThumbnail(user.privacy, viewerIsFriend);
  const avatarZoomable = canZoomAvatar(user.privacy, viewerIsFriend);
  const profileVisible = canViewProfileDetails(user.privacy, viewerIsFriend);
  const presenceVisible = canViewLastSeen(user.privacy, viewerIsFriend);

  let friendshipMeta: UserSearchResult["friendship"];
  if (friendship) {
    const requesterId = friendship.requester.toString();
    const direction = requesterId === searcherId ? "outgoing" : "incoming";
    if (friendship.status === "blocked") {
      const blockedByMe = friendship.actionBy.toString() === searcherId;
      if (!blockedByMe) {
        return {
          _id: user._id.toString(),
          displayName: "Linkr user",
          presenceVisible: false,
          profileDetailsVisible: false,
          contactCardVisible: false,
        };
      }
      friendshipMeta = {
        id: friendship._id.toString(),
        status: "blocked",
        direction,
        blockedByMe: true,
      };
    } else {
      friendshipMeta = {
        id: friendship._id.toString(),
        status: friendship.status,
        direction,
      };
    }
  }

  return {
    _id: user._id.toString(),
    username: user.username ?? undefined,
    displayName: avatarVisible ? user.displayName : "Linkr user",
    avatar: avatarVisible ? resolveAvatarUrl(user.avatar, user._id.toString()) : undefined,
    bio: profileVisible ? user.bio ?? undefined : undefined,
    status: profileVisible ? activeStatus(user.status, user.statusExpiresAt) : undefined,
    online: presenceVisible ? Boolean(user.online) : undefined,
    lastSeen: presenceVisible ? user.lastSeen?.toISOString() : undefined,
    presenceVisible,
    profileDetailsVisible: profileVisible,
    contactCardVisible: avatarVisible,
    avatarZoomable,
    ...(friendshipMeta ? { friendship: friendshipMeta } : {}),
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
    .select(
      "_id username displayName avatar bio status statusExpiresAt online lastSeen privacy",
    );

  const results: UserSearchResult[] = [];

  for (const user of users) {
    const friendship = await findFriendshipBetween(searcherId, user.id);
    const row = buildUserProfileView(user, searcherId, friendship);
    if (friendship?.status === "blocked" && !row.friendship) continue;
    results.push(row);
  }

  return results;
}

/** Privacy-gated profile for the contact card (refreshed on open / poll). */
export async function getUserProfileForViewer(
  targetUserId: string,
  viewerId: string,
): Promise<UserSearchResult> {
  if (targetUserId === viewerId) {
    throw ApiError.badRequest("Use your own profile settings");
  }

  const user = await UserModel.findOne({ _id: targetUserId, onboarded: true }).select(
    "_id username displayName avatar bio status statusExpiresAt online lastSeen privacy",
  );
  if (!user) throw ApiError.notFound("User not found");

  const friendship = await findFriendshipBetween(viewerId, user.id);
  const row = buildUserProfileView(user, viewerId, friendship);
  if (friendship?.status === "blocked" && !row.friendship) {
    throw ApiError.notFound("User not found");
  }
  return row;
}

/** Dismiss the one-time E2EE setup prompt without creating a backup yet. */
export async function dismissE2EESetupPrompt(user: UserDocument): Promise<UserDocument> {
  user.e2eeSetupPromptPending = false;
  await user.save();
  return user;
}

/** Update privacy settings for the authenticated user. */
export async function updatePrivacy(user: UserDocument, input: PrivacyUpdateInput): Promise<UserDocument> {
  if (!user.privacy) {
    user.privacy = {
      lastSeen: "friends",
      profile: "friends",
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

/**
 * File a report against another user (Phase 4). Validates the target exists and isn't the reporter,
 * then records it. To curb spam we de-duplicate: if the reporter already has an OPEN report against
 * the same user we update its reason/details rather than stacking a new row. Returns nothing — the
 * client only needs a success acknowledgement.
 */
export async function reportUser(
  reporterId: string,
  reportedUserId: string,
  input: ReportUserInput,
): Promise<void> {
  if (reporterId === reportedUserId) {
    throw ApiError.badRequest("You can't report yourself");
  }
  const target = await UserModel.exists({ _id: reportedUserId });
  if (!target) throw ApiError.notFound("User not found");

  const details = input.details?.trim() ? input.details.trim() : undefined;

  const existingOpen = await ReportModel.findOne({
    reporter: reporterId,
    reportedUser: reportedUserId,
    status: "open",
  });
  if (existingOpen) {
    existingOpen.reason = input.reason;
    existingOpen.set("details", details);
    await existingOpen.save();
    return;
  }

  await ReportModel.create({
    reporter: reporterId,
    reportedUser: reportedUserId,
    reason: input.reason,
    ...(details ? { details } : {}),
  });
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
