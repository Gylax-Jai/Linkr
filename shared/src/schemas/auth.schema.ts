import { z } from "zod";
import { OTP_CODE_LENGTH, PHONE_E164_REGEX } from "../constants/limits.js";
import {
  usernameSchema,
  displayNameSchema,
  bioSchema,
  statusSchema,
} from "./user.schema.js";

/** A phone number in E.164 format (blueprint §4). */
export const phoneSchema = z
  .string()
  .trim()
  .regex(PHONE_E164_REGEX, "Enter a valid phone number in international format (e.g. +14155552671)");

/** Body for POST /api/auth/google — the Google ID token (JWT credential) from the client. */
export const googleLoginSchema = z.object({
  idToken: z.string().min(1, "Missing Google credential"),
});
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;

/** Body for POST /api/auth/otp/send. */
export const otpSendSchema = z.object({
  phone: phoneSchema,
});
export type OtpSendInput = z.infer<typeof otpSendSchema>;

/** Body for POST /api/auth/otp/verify. */
export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: z
    .string()
    .trim()
    .length(OTP_CODE_LENGTH, `Code must be ${OTP_CODE_LENGTH} digits`)
    .regex(/^\d+$/, "Code must be numeric"),
});
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

/**
 * Body for POST /api/auth/otp/msg91-verify — the JWT access token the MSG91 OTP widget returns
 * after it has sent + verified the code client-side. The server re-verifies it with MSG91 and reads
 * the trusted phone number from the response (the client never asserts its own phone).
 */
export const msg91VerifySchema = z.object({
  accessToken: z.string().trim().min(1, "Missing MSG91 access token"),
});
export type Msg91VerifyInput = z.infer<typeof msg91VerifySchema>;

/** Query for GET /api/users/username-available?username=. */
export const usernameQuerySchema = z.object({
  username: usernameSchema,
});
export type UsernameQueryInput = z.infer<typeof usernameQuerySchema>;

/**
 * Body for POST /api/users/onboarding. The verified phone is taken from the prior OTP step
 * (server-side state), so it is intentionally NOT part of this payload.
 */
export const onboardingSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  bio: bioSchema.optional(),
  status: statusSchema.optional(),
  avatar: z.string().url().optional(),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;
