import { z } from "zod";
import {
  USERNAME_MIN,
  USERNAME_MAX,
  USERNAME_REGEX,
  DISPLAY_NAME_MAX,
  BIO_MAX,
  STATUS_MAX,
} from "../constants/limits.js";

/** @username: 3–20 chars, letters/numbers/_ only (blueprint §4). */
export const usernameSchema = z
  .string()
  .trim()
  .min(USERNAME_MIN, `Username must be at least ${USERNAME_MIN} characters`)
  .max(USERNAME_MAX, `Username must be at most ${USERNAME_MAX} characters`)
  .regex(USERNAME_REGEX, "Only letters, numbers and underscore are allowed");

export const displayNameSchema = z.string().trim().min(1).max(DISPLAY_NAME_MAX);
export const bioSchema = z.string().trim().max(BIO_MAX);
export const statusSchema = z.string().trim().max(STATUS_MAX);

/** Shape used by the onboarding/profile forms (filled out in later sprints). */
export const profileSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  bio: bioSchema.optional(),
  status: statusSchema.optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;

/** PATCH /api/users/me — displayName, bio, status only (username is immutable). */
export const profileUpdateSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    bio: bioSchema.optional(),
    status: statusSchema.optional(),
  })
  .refine((data) => data.displayName !== undefined || data.bio !== undefined || data.status !== undefined, {
    message: "At least one field must be provided",
  });

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
