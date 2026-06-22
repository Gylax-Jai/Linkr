import type { RequestHandler } from "express";

/**
 * Wraps an async controller so rejected promises are forwarded to the global error handler
 * via `next(err)` (blueprint §16: one global error handler, no unhandled rejections).
 */
export function asyncHandler(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
