import { Router } from "express";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "@linkr/shared";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { getVapidKey, postSubscribe, postUnsubscribe } from "./push.controller.js";

export const pushRouter: Router = Router();

pushRouter.get("/vapid-public-key", requireAuth, getVapidKey);
pushRouter.post("/subscribe", requireAuth, validate(pushSubscribeSchema), postSubscribe);
pushRouter.delete("/subscribe", requireAuth, validate(pushUnsubscribeSchema), postUnsubscribe);
