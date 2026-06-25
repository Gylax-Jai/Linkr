import type { Request } from "express";
import type { PushSubscribeInput, PushUnsubscribeInput } from "@linkr/shared";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getVapidPublicKey, removePushSubscription, savePushSubscription } from "./push.service.js";

function requireUserId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.id;
}

/** GET /api/push/vapid-public-key — public VAPID key for the browser subscribe call. */
export const getVapidKey = asyncHandler(async (_req, res) => {
  const publicKey = getVapidPublicKey();
  res.status(200).json({ publicKey });
});

/** POST /api/push/subscribe — register this browser for background push. */
export const postSubscribe = asyncHandler(async (req, res) => {
  const body = req.body as PushSubscribeInput;
  await savePushSubscription(requireUserId(req), {
    endpoint: body.endpoint,
    keys: body.keys,
    expirationTime: body.expirationTime ?? null,
  });
  res.status(201).json({ ok: true });
});

/** DELETE /api/push/subscribe — remove a push subscription. */
export const postUnsubscribe = asyncHandler(async (req, res) => {
  const { endpoint } = req.body as PushUnsubscribeInput;
  await removePushSubscription(requireUserId(req), endpoint);
  res.status(200).json({ ok: true });
});
