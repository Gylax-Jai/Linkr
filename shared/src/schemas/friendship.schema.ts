import { z } from "zod";
import { PROFILE_VISIBILITY_VALUES, USERNAME_MAX } from "../constants/limits.js";
import { friendshipStatusSchema } from "./enums.schema.js";
import { visibilitySchema } from "./enums.schema.js";

/** Query for GET /api/users/search?q= */
export const userSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1, "Enter at least one character")
    .max(USERNAME_MAX),
});

export type UserSearchQueryInput = z.infer<typeof userSearchQuerySchema>;

/** Body for POST /api/friends/request */
export const friendRequestBodySchema = z.object({
  recipientId: z.string().min(1, "Recipient is required"),
});

export type FriendRequestBody = z.infer<typeof friendRequestBodySchema>;

/** Body for PATCH /api/users/me/privacy */
export const privacyUpdateSchema = z.object({
  lastSeen: visibilitySchema.optional(),
  profileDetails: z.enum(PROFILE_VISIBILITY_VALUES).optional(),
  profilePicture: z.enum(PROFILE_VISIBILITY_VALUES).optional(),
  /** @deprecated Sets both profileDetails and profilePicture when the split fields are omitted. */
  profile: z.enum(PROFILE_VISIBILITY_VALUES).optional(),
  whoCanRequest: z.enum(["everyone", "nobody"]).optional(),
});

export type PrivacyUpdateInput = z.infer<typeof privacyUpdateSchema>;

/** Params for friendship actions keyed by friendship id */
export const friendshipIdParamSchema = z.object({
  friendshipId: z.string().min(1),
});

export type FriendshipIdParam = z.infer<typeof friendshipIdParamSchema>;

/** Params for block keyed by target user id */
export const userIdParamSchema = z.object({
  userId: z.string().min(1),
});

export type UserIdParam = z.infer<typeof userIdParamSchema>;

export const friendshipStatusResponseSchema = z.object({
  status: friendshipStatusSchema,
});
