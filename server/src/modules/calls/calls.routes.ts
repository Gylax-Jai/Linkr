import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getIceConfig } from "./calls.controller.js";

/**
 * Calls module (Phase 3). REST surface is just the ICE config endpoint; the call handshake itself
 * runs over Socket.IO (server/src/sockets/calls.socket.ts). TURN credentials are minted per-user
 * and short-lived — the shared TURN secret never leaves the server.
 */
export const callsRouter: Router = Router();

callsRouter.use(requireAuth);

callsRouter.get("/ice-config", getIceConfig);
