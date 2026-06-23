import { Router } from "express";
import { authRouter } from "./auth/auth.routes.js";
import { usersRouter } from "./users/users.routes.js";
import { friendsRouter } from "./friends/friends.routes.js";
import { chatRouter } from "./chat/chat.routes.js";
import { notificationsRouter } from "./notifications/notifications.routes.js";
import { keysRouter } from "./keys/keys.routes.js";
import { sessionsRouter } from "./sessions/sessions.routes.js";
import { callsRouter } from "./calls/calls.routes.js";

/** Aggregates every feature module under a single /api router (mounted in app.ts). */
export const apiRouter: Router = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/friends", friendsRouter);
apiRouter.use("/chat", chatRouter);
apiRouter.use("/notifications", notificationsRouter);
apiRouter.use("/keys", keysRouter);
apiRouter.use("/sessions", sessionsRouter);
apiRouter.use("/calls", callsRouter);
