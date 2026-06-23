import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { deleteOtherSessions, deleteSessionById, getSessions } from "./sessions.controller.js";

/**
 * Sessions/devices module (Sprint E): view signed-in devices and remotely revoke them. Every route
 * requires auth and is scoped to the caller's own sessions inside the service.
 */
export const sessionsRouter: Router = Router();

sessionsRouter.use(requireAuth);

sessionsRouter.get("/", getSessions);
// "/others" is declared before "/:id" so it isn't captured as an id param.
sessionsRouter.delete("/others", deleteOtherSessions);
sessionsRouter.delete("/:id", deleteSessionById);
