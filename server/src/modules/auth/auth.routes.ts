import { Router } from "express";
import { googleLoginSchema, msg91VerifySchema, otpSendSchema, otpVerifySchema } from "@linkr/shared";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  googleLogin,
  logout,
  me,
  otpMsg91Verify,
  otpSend,
  otpVerify,
  refresh,
} from "./auth.controller.js";

/**
 * Auth module (blueprint §4, §10): Google ID-token login + JWT sessions + phone OTP.
 * Layered route → controller → service. Validation lives at the edge via Zod schemas.
 */
export const authRouter: Router = Router();

authRouter.post("/google", validate(googleLoginSchema), googleLogin);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, me);

authRouter.post("/otp/send", requireAuth, validate(otpSendSchema), otpSend);
authRouter.post("/otp/verify", requireAuth, validate(otpVerifySchema), otpVerify);
authRouter.post("/otp/msg91-verify", requireAuth, validate(msg91VerifySchema), otpMsg91Verify);
