import { Router } from "express";
import {
  friendRequestBodySchema,
  friendshipIdParamSchema,
  userIdParamSchema,
} from "@linkr/shared";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import {
  acceptRequest,
  block,
  cancelRequest,
  getFriends,
  getPending,
  rejectRequest,
  remove,
  sendRequest,
  unblock,
} from "./friends.controller.js";

/**
 * Friends module (blueprint §5, §10): send/accept/reject/cancel requests and block.
 * Friendship state gates all messaging/calling via the `requireFriendship` middleware.
 */
export const friendsRouter: Router = Router();

friendsRouter.use(requireAuth);

friendsRouter.get("/", getFriends);
friendsRouter.get("/pending", getPending);
friendsRouter.post("/request", validate(friendRequestBodySchema), sendRequest);
friendsRouter.post(
  "/block/:userId",
  validate(userIdParamSchema, "params"),
  block,
);
friendsRouter.post(
  "/unblock/:userId",
  validate(userIdParamSchema, "params"),
  unblock,
);
friendsRouter.post(
  "/:friendshipId/accept",
  validate(friendshipIdParamSchema, "params"),
  acceptRequest,
);
friendsRouter.post(
  "/:friendshipId/reject",
  validate(friendshipIdParamSchema, "params"),
  rejectRequest,
);
// Unfriend an accepted friend by their user id. The static `/friend/` segment can't collide with
// the single-segment `/:friendshipId` cancel route below (two path segments vs one).
friendsRouter.delete(
  "/friend/:userId",
  validate(userIdParamSchema, "params"),
  remove,
);
friendsRouter.delete(
  "/:friendshipId",
  validate(friendshipIdParamSchema, "params"),
  cancelRequest,
);
