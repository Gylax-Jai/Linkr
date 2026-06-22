import type { RequestHandler } from "express";
import { ApiError } from "../utils/ApiError.js";
import { areFriends } from "../modules/friends/friendship.helpers.js";

type TargetUserResolver = (req: Parameters<RequestHandler>[0]) => string | undefined;

/**
 * CORE PRIVACY RULE (blueprint §5): messaging/calling is only allowed between accepted
 * friends. Resolves the target user id from the request and rejects with `403 NOT_FRIENDS`
 * unless status === "accepted".
 */
export function requireFriendship(resolveTargetUserId: TargetUserResolver): RequestHandler {
  return async (req, _res, next) => {
    try {
      if (!req.user) {
        throw ApiError.unauthorized();
      }

      const targetUserId = resolveTargetUserId(req);
      if (!targetUserId) {
        throw ApiError.badRequest("Target user is required");
      }

      if (req.user.id === targetUserId) {
        next();
        return;
      }

      const friends = await areFriends(req.user.id, targetUserId);
      if (!friends) {
        throw ApiError.forbidden("NOT_FRIENDS", "You must be friends to perform this action");
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
