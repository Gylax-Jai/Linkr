import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

/** 404 fallthrough for unmatched routes. */
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: "Route not found", code: "NOT_FOUND" });
};

/**
 * Global error handler. Always responds with the blueprint's `{ error, code }` shape and
 * never leaks internal details/stack traces to clients.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    if (err.status >= 500) logger.error(err.message, { code: err.code });
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      issues: err.flatten(),
    });
    return;
  }

  logger.error("Unhandled error", err instanceof Error ? err.message : String(err));
  res.status(500).json({ error: "Internal server error", code: "INTERNAL_ERROR" });
};
