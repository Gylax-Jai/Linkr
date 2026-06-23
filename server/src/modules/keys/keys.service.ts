import type {
  KeyBackup,
  KeyBackupResponse,
  RecoverResponse,
  RecoveryCodeEnvelope,
  RedeemRecoveryCodeInput,
} from "@linkr/shared";
import { features } from "../../config/env.js";
import { UserModel } from "../../models/User.js";
import { ApiError } from "../../utils/ApiError.js";
import { decryptPhone, hashPhone } from "../../utils/crypto.js";
import { logger } from "../../utils/logger.js";
import { consumeOtp } from "../auth/otp.service.js";
import { verifyMsg91AccessToken } from "../auth/msg91.service.js";
import { areFriends } from "../friends/friendship.helpers.js";

/**
 * E2EE key service (Phase 2 + Sprint D / D.1). The server only ever stores/returns PUBLIC keys and
 * OPAQUE, client-encrypted blobs — private keys, the recovery passphrase, and the raw recovery codes
 * live exclusively in the owner's browser and never touch the server in readable form.
 */

/** Mask a verified E.164 phone to its last 4 digits for a recognizable, non-revealing hint. */
function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  const last4 = digits.slice(-4);
  return `•••• ${last4}`;
}

/**
 * Publish (or rotate) the authenticated user's public key. When the key actually CHANGES (a key
 * reset on a new device, or losing the recovery passphrase), the stored account key backup AND the
 * single-use recovery codes are cleared too — they encrypt the OLD private key, so they'd no longer
 * match. The owner is then re-prompted to set fresh recovery. Re-publishing the same key is a no-op.
 */
export async function publishPublicKey(userId: string, publicKey: string): Promise<void> {
  const user = await UserModel.findById(userId).select("publicKey");
  if (!user) throw ApiError.notFound("User not found");

  const changed = user.publicKey !== publicKey;
  const update: Record<string, unknown> = { $set: { publicKey } };
  if (changed) update.$unset = { keyBackup: 1, recoveryCodes: 1 };
  await UserModel.updateOne({ _id: userId }, update);
}

/** Fetch the caller's own encrypted account-key backup (+ the public key it unlocks to). */
export async function getKeyBackup(userId: string): Promise<KeyBackupResponse> {
  const user = await UserModel.findById(userId).select("+keyBackup +recoveryCodes +phoneEnc publicKey");
  if (!user) throw ApiError.notFound("User not found");

  const b = user.keyBackup;
  const hasBackup = Boolean(b && typeof b.ciphertext === "string" && b.ciphertext.length > 0);
  const backup: KeyBackup | null =
    hasBackup && b
      ? {
          v: Number(b.v),
          salt: String(b.salt),
          nonce: String(b.nonce),
          ciphertext: String(b.ciphertext),
          opslimit: Number(b.opslimit),
          memlimit: Number(b.memlimit),
        }
      : null;

  const recoveryCodesRemaining = (user.recoveryCodes ?? []).filter((c) => !c.used).length;

  // Decrypt the phone only to derive a masked hint; never return the full number. Failures (e.g. a
  // rotated PHONE_ENC_KEY) degrade to no hint rather than breaking the backup status response.
  let phoneHint: string | null = null;
  if (typeof user.phoneEnc === "string" && user.phoneEnc.length > 0) {
    try {
      phoneHint = maskPhone(decryptPhone(user.phoneEnc));
    } catch {
      phoneHint = null;
    }
  }

  return {
    hasBackup,
    backup,
    publicKey: typeof user.publicKey === "string" && user.publicKey.length > 0 ? user.publicKey : null,
    recoveryCodesRemaining,
    phoneHint,
  };
}

/**
 * Store/replace the caller's account public key + encrypted key backup together (atomic), so the
 * stored public key always matches the keypair inside the backup. Optionally replaces the single-use
 * recovery-code envelopes in the same write. All blobs are opaque to the server.
 */
export async function saveKeyBackup(
  userId: string,
  publicKey: string,
  backup: KeyBackup,
  recoveryCodes?: RecoveryCodeEnvelope[],
): Promise<void> {
  const set: Record<string, unknown> = { publicKey, keyBackup: backup };
  if (recoveryCodes) {
    set.recoveryCodes = recoveryCodes.map((c) => ({
      idHash: c.idHash,
      v: c.v,
      salt: c.salt,
      nonce: c.nonce,
      ciphertext: c.ciphertext,
      opslimit: c.opslimit,
      memlimit: c.memlimit,
      used: false,
    }));
  }
  const result = await UserModel.updateOne({ _id: userId }, { $set: set });
  if (result.matchedCount === 0) {
    throw ApiError.notFound("User not found");
  }
}

/**
 * Redeem ONE single-use recovery code on a new device (Sprint D.1). Flow:
 *  1. Prove phone ownership — re-verify the MSG91 access token (prod) or the dev OTP (no provider).
 *  2. Confirm the verified number matches THIS account's phone (codes are tied to the user's number).
 *  3. Look up the envelope by its SHA-256 id, ensure it's unused, BURN it, and return the sealed blob.
 * The raw code never reaches the server, so it still can't open the envelope — the client decrypts it.
 */
export async function redeemRecoveryCode(
  userId: string,
  input: RedeemRecoveryCodeInput,
): Promise<RecoverResponse> {
  // 1) Prove control of a phone number.
  let verifiedPhone: string;
  if (features.msg91) {
    if (!input.accessToken) throw ApiError.badRequest("Phone verification is required");
    verifiedPhone = await verifyMsg91AccessToken(input.accessToken);
  } else {
    if (!input.phone || !input.otp) throw ApiError.badRequest("Phone verification is required");
    await consumeOtp(hashPhone(input.phone), input.otp);
    verifiedPhone = input.phone;
  }

  // 2) It must be the number bound to this account.
  const user = await UserModel.findById(userId).select("+recoveryCodes +phoneHash publicKey");
  if (!user) throw ApiError.notFound("User not found");
  if (!user.phoneHash || user.phoneHash !== hashPhone(verifiedPhone)) {
    throw ApiError.forbidden("PHONE_MISMATCH", "This phone number doesn't match your account");
  }

  // 3) Find an unused envelope for the supplied code id, then burn it.
  const codes = user.recoveryCodes ?? [];
  const entry = codes.find((c) => c.idHash === input.codeHash && !c.used);
  if (!entry) {
    throw new ApiError(400, "RECOVERY_CODE_INVALID", "That backup code isn't valid or was already used");
  }
  entry.used = true;
  entry.usedAt = new Date();
  await user.save();
  logger.info("Recovery code redeemed", { userId });

  return {
    envelope: {
      v: Number(entry.v),
      salt: String(entry.salt),
      nonce: String(entry.nonce),
      ciphertext: String(entry.ciphertext),
      opslimit: Number(entry.opslimit),
      memlimit: Number(entry.memlimit),
    },
    publicKey: typeof user.publicKey === "string" && user.publicKey.length > 0 ? user.publicKey : null,
  };
}

/**
 * Fetch a user's public key. Readable only for yourself or an accepted friend — you can only ever
 * message friends, so this mirrors that boundary and avoids key enumeration by strangers. Returns
 * null when the target user has not published a key yet (e.g. the dev bot, which has no browser).
 */
export async function getPublicKey(requesterId: string, targetId: string): Promise<string | null> {
  if (requesterId !== targetId && !(await areFriends(requesterId, targetId))) {
    throw ApiError.forbidden("NOT_FRIENDS", "You can only fetch keys for yourself or friends");
  }
  const user = await UserModel.findById(targetId).select("publicKey");
  if (!user) throw ApiError.notFound("User not found");
  return typeof user.publicKey === "string" && user.publicKey.length > 0 ? user.publicKey : null;
}
