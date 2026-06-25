import { z } from "zod";

/** Browser push subscription keys (Web Push API). */
export const pushSubscriptionKeysSchema = z.object({
  p256dh: z.string().min(1),
  auth: z.string().min(1),
});

/** POST /api/push/subscribe — store a Web Push subscription for the current user. */
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: pushSubscriptionKeysSchema,
  expirationTime: z.number().nullable().optional(),
});

/** DELETE /api/push/subscribe — remove a subscription by endpoint. */
export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;
export type PushUnsubscribeInput = z.infer<typeof pushUnsubscribeSchema>;
