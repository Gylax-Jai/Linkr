import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { apiRouter } from "./modules/index.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";

/** Builds and configures the Express application (middleware → routes → error handling). */
export function createApp(): Express {
  const app = express();

  // Security headers (blueprint §16) and CORS scoped to the known client origin only.
  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
    }),
  );

  // Body parsing with a sane limit to reduce DoS surface.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Refresh-token cookie parsing (read by /api/auth/refresh and /api/auth/logout).
  app.use(cookieParser());

  // Liveness/readiness (top-level, unauthenticated).
  app.use("/health", healthRouter);

  // Feature modules.
  app.use("/api", apiRouter);

  // 404 + global error handler — always responds as { error, code }.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
