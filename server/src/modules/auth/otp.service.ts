import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  OTP_CODE_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_MS,
  OTP_TTL_MS,
} from "@linkr/shared";
import { env } from "../../config/env.js";
import { OtpModel } from "../../models/Otp.js";
import { UserModel } from "../../models/User.js";
import { ApiError } from "../../utils/ApiError.js";
import { encryptPhone, hashPhone } from "../../utils/crypto.js";
import { logger } from "../../utils/logger.js";
import type { UserDocument } from "./auth.service.js";

/** Phone OTP service (blueprint §4). Codes are stored hashed only; phones are keyed by HMAC. */

const BCRYPT_ROUNDS = 10;

function generateCode(): string {
  return randomInt(0, 10 ** OTP_CODE_LENGTH)
    .toString()
    .padStart(OTP_CODE_LENGTH, "0");
}

/** Reject a phone already claimed by a DIFFERENT onboarded account ("ONE account per phone"). */
async function assertPhoneNotTaken(phoneHash: string, currentUserId: string): Promise<void> {
  const owner = await UserModel.findOne({ phoneHash, onboarded: true });
  if (owner && owner.id !== currentUserId) {
    throw new ApiError(409, "PHONE_TAKEN", "This phone number is already linked to another account");
  }
}

/**
 * Bind an already-verified phone number to the user (encrypted at rest + HMAC index). Shared by the
 * built-in OTP flow and the MSG91 widget flow — the caller is responsible for proving the phone was
 * actually verified (a correct code, or a server-validated MSG91 access token) before calling this.
 */
export async function bindVerifiedPhone(user: UserDocument, phone: string): Promise<void> {
  const phoneHash = hashPhone(phone);

  // Final uniqueness re-check, then release the number from any stale (non-onboarded) holder
  // so the unique phoneHash index never collides when we claim it for this user.
  await assertPhoneNotTaken(phoneHash, user.id);
  await UserModel.updateMany(
    { phoneHash, _id: { $ne: user.id } },
    { $unset: { phoneEnc: "", phoneHash: "" }, $set: { phoneVerified: false } },
  );

  user.phoneEnc = encryptPhone(phone);
  user.phoneHash = phoneHash;
  user.phoneVerified = true;
  await user.save();
}

export interface SendOtpResult {
  expiresInMs: number;
  /** Present only when no SMS provider is configured AND not in production. */
  devCode?: string;
}

export async function sendOtp(user: UserDocument, phone: string): Promise<SendOtpResult> {
  const phoneHash = hashPhone(phone);
  await assertPhoneNotTaken(phoneHash, user.id);

  const existing = await OtpModel.findOne({ phone: phoneHash });
  if (existing?.lastSentAt && Date.now() - existing.lastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    throw new ApiError(429, "OTP_RATE_LIMITED", "Please wait a moment before requesting another code");
  }

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
  await OtpModel.findOneAndUpdate(
    { phone: phoneHash },
    { phone: phoneHash, codeHash, expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0, lastSentAt: new Date() },
    { upsert: true },
  );

  const hasProvider = Boolean(env.OTP_PROVIDER_KEY);
  if (hasProvider) {
    // TODO: integrate Twilio/MSG91 here. Until then we only log that a code would be sent.
    logger.info("OTP send requested (provider configured)", { phoneHash });
  } else {
    // Mock provider: surface the code via logs so it is testable without SMS.
    logger.info("OTP (no SMS provider configured)", { phoneHash, code });
  }

  return {
    expiresInMs: OTP_TTL_MS,
    devCode: !hasProvider && env.NODE_ENV !== "production" ? code : undefined,
  };
}

/** Verify a code and, on success, store the encrypted phone + HMAC on the user. */
export async function verifyOtp(user: UserDocument, phone: string, code: string): Promise<void> {
  const phoneHash = hashPhone(phone);
  const record = await OtpModel.findOne({ phone: phoneHash });
  if (!record) {
    throw new ApiError(400, "OTP_NOT_FOUND", "Request a code first");
  }
  if (record.expiresAt.getTime() < Date.now()) {
    await record.deleteOne();
    throw new ApiError(400, "OTP_EXPIRED", "This code has expired — request a new one");
  }
  if ((record.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
    throw new ApiError(429, "OTP_LOCKED", "Too many attempts — request a new code");
  }

  const ok = await bcrypt.compare(code, record.codeHash);
  if (!ok) {
    record.attempts = (record.attempts ?? 0) + 1;
    await record.save();
    throw new ApiError(400, "OTP_INVALID", "Incorrect code");
  }

  await bindVerifiedPhone(user, phone);
  await record.deleteOne();
}
