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

/**
 * How long a custom status stays visible before auto-clearing (Sprint C.1). `null` = never expire.
 * The server turns the chosen number of hours into an absolute `statusExpiresAt`.
 */
export const STATUS_DURATION_HOURS = [1, 4, 24, 48, 168] as const;
export const statusDurationSchema = z
  .number()
  .refine((n) => (STATUS_DURATION_HOURS as readonly number[]).includes(n), "Invalid status duration")
  .nullable();

/** PATCH /api/users/me — displayName, bio, status only (username is immutable). */
export const profileUpdateSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    bio: bioSchema.optional(),
    status: statusSchema.optional(),
    /** Hours until the status auto-clears; `null` = no expiry. Only meaningful when `status` is set. */
    statusDurationHours: statusDurationSchema.optional(),
  })
  .refine((data) => data.displayName !== undefined || data.bio !== undefined || data.status !== undefined, {
    message: "At least one field must be provided",
  });

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/**
 * Account deletion (Phase 4). `mode` chooses a 15-day reversible deactivation ("scheduled") or an
 * irreversible purge now ("immediate"). `confirm` must match the user's @username (or, for accounts
 * without one, their email) — a typed safety gate so the action can't be triggered by accident.
 */
export const deleteAccountSchema = z.object({
  mode: z.enum(["scheduled", "immediate"]),
  confirm: z.string().trim().min(1, "Type your username to confirm"),
});

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
