import type { RequestHandler } from "express";
import { UserModel } from "../models/User.js";
import { ApiError } from "../utils/ApiError.js";
import { verifyAccessToken } from "../utils/jwt.js";

/**
 * Authenticates a request via the `Authorization: Bearer <accessToken>` header (blueprint §4).
 * Verifies the access token, loads the user, and attaches `req.user`. Any missing/invalid token
 * yields a generic 401 so we don't leak whether the user exists.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.header("authorization") ?? "";
    const [scheme, token] = header.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw ApiError.unauthorized();
    }

    const userId = verifyAccessToken(token);
    const user = await UserModel.findById(userId);
    if (!user) {
      throw ApiError.unauthorized();
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};
