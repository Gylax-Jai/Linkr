import type { IceConfigResponse } from "@linkr/shared";
import { ApiError } from "../../utils/ApiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { buildIceConfig } from "./calls.service.js";

/** GET /api/calls/ice-config — short-lived STUN/TURN config for the authenticated caller. */
export const getIceConfig = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  const body: IceConfigResponse = buildIceConfig(req.user.id);
  // These credentials are per-user and expire; never cache them in a shared/proxy cache.
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(body);
});
