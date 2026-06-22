import { Router } from "express";
import { healthCheck } from "./health.controller.js";

/** Route layer: wires paths to controllers (route → controller → service, blueprint §16). */
export const healthRouter: Router = Router();

healthRouter.get("/", healthCheck);
