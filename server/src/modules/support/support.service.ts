import type { SupportContactInput } from "@linkr/shared";
import { SupportMessageModel } from "../../models/SupportMessage.js";
import { isMongoConnected } from "../../config/db.js";
import { ApiError } from "../../utils/ApiError.js";

/** Persist a support query from the signed-in user (review in MongoDB / Atlas). */
export async function createSupportMessage(
  userId: string,
  profile: { email: string; displayName: string; username?: string | null },
  input: SupportContactInput,
): Promise<void> {
  if (!isMongoConnected()) {
    throw ApiError.internal("Support is temporarily unavailable");
  }

  await SupportMessageModel.create({
    user: userId,
    email: profile.email,
    displayName: profile.displayName,
    username: profile.username?.trim() || undefined,
    message: input.message.trim(),
  });
}
