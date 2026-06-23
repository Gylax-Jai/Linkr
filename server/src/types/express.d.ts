import type { HydratedDocument } from "mongoose";
import type { UserDoc } from "../models/User.js";

/**
 * Express Request augmentation: `requireAuth` attaches the authenticated user document here so
 * downstream controllers can read `req.user` with full typing.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: HydratedDocument<UserDoc>;
      /** Session/device id from the access token (Sprint E); identifies the current device. */
      sessionId?: string;
    }
  }
}

export {};
