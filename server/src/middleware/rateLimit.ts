import type { RequestHandler } from "express";

/**
 * TODO (Sprint 1+): Apply rate limiting (per IP + per user + global) to auth and write
 * endpoints, ideally backed by Redis so limits hold across multiple server instances.
 *
 * Placeholder for Sprint 0 — intentionally a no-op.
 */
export const rateLimit = (_options?: { windowMs?: number; max?: number }): RequestHandler => {
  return (_req, _res, next) => next();
};
