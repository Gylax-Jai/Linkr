import mongoose from "mongoose";
import { features } from "../../config/env.js";

export interface HealthReport {
  status: "ok";
  uptime: number;
  timestamp: string;
  services: {
    mongo: "connected" | "disconnected" | "disabled";
    redis: "enabled" | "disabled";
  };
}

/** Service layer: gathers liveness info. Pure logic, no HTTP concerns. */
export function getHealthReport(): HealthReport {
  const mongoState =
    mongoose.connection.readyState === 1
      ? "connected"
      : features.mongo
        ? "disconnected"
        : "disabled";

  return {
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: {
      mongo: mongoState,
      redis: features.redis ? "enabled" : "disabled",
    },
  };
}
