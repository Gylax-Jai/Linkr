import webpush from "web-push";
import type { NotificationType } from "@linkr/shared";
import { PushSubscriptionModel } from "../../models/PushSubscription.js";
import { env, features } from "../../config/env.js";
import { isMongoConnected } from "../../config/db.js";
import { logger } from "../../utils/logger.js";

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

function configureWebPush(): boolean {
  if (!features.webPush) return false;
  webpush.setVapidDetails(
    env.VAPID_SUBJECT!,
    env.VAPID_PUBLIC_KEY!,
    env.VAPID_PRIVATE_KEY!,
  );
  return true;
}

/** Store or refresh a browser push subscription for the current user. */
export async function savePushSubscription(
  userId: string,
  input: { endpoint: string; keys: { p256dh: string; auth: string }; expirationTime?: number | null },
): Promise<void> {
  if (!isMongoConnected()) return;
  await PushSubscriptionModel.findOneAndUpdate(
    { user: userId, endpoint: input.endpoint },
    {
      user: userId,
      endpoint: input.endpoint,
      keys: input.keys,
      ...(input.expirationTime ? { expirationTime: new Date(input.expirationTime) } : { expirationTime: undefined }),
    },
    { upsert: true, new: true },
  );
}

/** Remove a push subscription (user disabled notifications or endpoint rotated). */
export async function removePushSubscription(userId: string, endpoint: string): Promise<void> {
  if (!isMongoConnected()) return;
  await PushSubscriptionModel.deleteOne({ user: userId, endpoint });
}

/** Drop stale subscriptions after the push service returns 404/410. */
async function pruneSubscription(userId: string, endpoint: string): Promise<void> {
  try {
    await PushSubscriptionModel.deleteOne({ user: userId, endpoint });
  } catch {
    /* best-effort */
  }
}

/** Send a generic push to every device registered for this user. Never includes message bodies (E2EE). */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!configureWebPush() || !isMongoConnected()) return;

  const subs = await PushSubscriptionModel.find({ user: userId });
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.keys!.p256dh, auth: sub.keys!.auth },
          },
          body,
        );
      } catch (err: unknown) {
        const status = typeof err === "object" && err && "statusCode" in err ? (err as { statusCode: number }).statusCode : 0;
        if (status === 404 || status === 410) {
          await pruneSubscription(userId, sub.endpoint);
        } else {
          logger.warn("Web push delivery failed", {
            userId,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }),
  );
}

/** Map in-app notification types to generic push copy (no decrypted content). */
export function pushPayloadForNotification(
  type: NotificationType,
  messagePreview?: string,
  chatId?: string,
): PushPayload | null {
  const url = chatId ? `/?chat=${chatId}` : "/";
  switch (type) {
    case "message":
      return {
        title: "Linkr",
        body: messagePreview?.trim() || "New message",
        url,
      };
    case "friend_request":
      return { title: "Linkr", body: "New friend request", url: "/?panel=friends" };
    case "friend_accepted":
      return { title: "Linkr", body: "Friend request accepted", url: "/?panel=friends" };
    default:
      return null;
  }
}

/** Expose the VAPID public key to authenticated clients (safe to publish). */
export function getVapidPublicKey(): string | null {
  return features.webPush ? env.VAPID_PUBLIC_KEY! : null;
}
