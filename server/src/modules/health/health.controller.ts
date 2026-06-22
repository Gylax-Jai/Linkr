import type { RequestHandler } from "express";
import { getHealthReport } from "./health.service.js";

/** Controller layer: maps HTTP <-> service. Thin by design. */
export const healthCheck: RequestHandler = (_req, res) => {
  res.status(200).json(getHealthReport());
};
