import { Router } from "express";
import {
  keyUserParamSchema,
  publishKeySchema,
  redeemRecoveryCodeSchema,
  uploadKeyBackupSchema,
} from "@linkr/shared";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { getKey, getMyBackup, publishKey, putMyBackup, recoverWithCode } from "./keys.controller.js";

/**
 * Keys module (Phase 2 + Sprint D): publishes users' E2EE public keys so friends can encrypt to
 * them, and stores each user's OPAQUE, client-encrypted account-key backup for multi-device restore.
 * Private keys and the recovery passphrase NEVER touch the server. Every route requires auth; key
 * reads are limited to yourself or accepted friends inside the service.
 */
export const keysRouter: Router = Router();

keysRouter.use(requireAuth);

// Account-key backup (self only). Declared BEFORE "/:userId" so "backup" isn't captured as a userId.
keysRouter.get("/backup", getMyBackup);
keysRouter.put("/backup", validate(uploadKeyBackupSchema, "body"), putMyBackup);
keysRouter.post("/recover", validate(redeemRecoveryCodeSchema, "body"), recoverWithCode);

keysRouter.post("/", validate(publishKeySchema, "body"), publishKey);
keysRouter.get("/:userId", validate(keyUserParamSchema, "params"), getKey);
