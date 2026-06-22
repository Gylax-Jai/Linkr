import { Router } from "express";
import { keyUserParamSchema, publishKeySchema } from "@linkr/shared";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { getKey, publishKey } from "./keys.controller.js";

/**
 * Keys module (Phase 2, blueprint §9): publishes users' E2EE public keys so friends can encrypt
 * to them. Private keys NEVER touch the server — they stay in the browser's IndexedDB. Every route
 * requires auth; key reads are limited to yourself or accepted friends inside the service.
 */
export const keysRouter: Router = Router();

keysRouter.use(requireAuth);

keysRouter.post("/", validate(publishKeySchema, "body"), publishKey);
keysRouter.get("/:userId", validate(keyUserParamSchema, "params"), getKey);
