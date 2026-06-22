import { Router } from "express";
import {
  AVATAR_MAX_BYTES,
  onboardingSchema,
  privacyUpdateSchema,
  profileUpdateSchema,
  userIdParamSchema,
  userSearchQuerySchema,
  usernameQuerySchema,
} from "@linkr/shared";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { singleFileUpload } from "../../middleware/upload.js";
import {
  getAvatar,
  onboarding,
  searchUsers,
  updateAvatar,
  updateMe,
  updateUserPrivacy,
  usernameAvailable,
} from "./users.controller.js";

/**
 * Users module (blueprint §4–§5, §10). Sprint 1 adds onboarding: username availability +
 * profile completion. Search/privacy/delete arrive in later sprints.
 */
export const usersRouter: Router = Router();

usersRouter.get(
  "/username-available",
  requireAuth,
  validate(usernameQuerySchema, "query"),
  usernameAvailable,
);
usersRouter.get("/search", requireAuth, validate(userSearchQuerySchema, "query"), searchUsers);
usersRouter.post("/onboarding", requireAuth, validate(onboardingSchema), onboarding);
usersRouter.patch("/me", requireAuth, validate(profileUpdateSchema), updateMe);
usersRouter.patch("/me/privacy", requireAuth, validate(privacyUpdateSchema), updateUserPrivacy);

// Profile photo: upload (multipart) + authenticated stream of locally-stored avatars (Sprint 5.5).
usersRouter.post("/me/avatar", requireAuth, singleFileUpload("file", AVATAR_MAX_BYTES), updateAvatar);
usersRouter.get(
  "/avatar/:userId",
  requireAuth,
  validate(userIdParamSchema, "params"),
  getAvatar,
);
