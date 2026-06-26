import mongoose from "mongoose";
import { env, features } from "./env.js";
import { logger } from "../utils/logger.js";


/**
 * Connect to MongoDB via Mongoose. Graceful by design (blueprint Sprint 0): if MONGODB_URI
 * is missing we warn and continue so the app still boots without DB credentials.
 */
export async function connectMongo(): Promise<void> {
  if (!features.mongo || !env.MONGODB_URI) {
    logger.warn("MONGODB_URI not set — skipping MongoDB connection (Sprint 0 runs without a DB)");
    return;
  }

  mongoose.set("strictQuery", true);

  mongoose.connection.on("connected", () => logger.info("MongoDB connected"));
  mongoose.connection.on("error", (err) => logger.error("MongoDB connection error", String(err)));
  mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));

  try {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  } catch (err) {
    // Don't crash the process in Sprint 0 — log and keep serving health/static routes.
   console.error("FULL MONGOOSE ERROR:");
console.dir(err, { depth: null });

logger.error(
  "Failed to connect to MongoDB (continuing without DB)",
  err instanceof Error ? err.stack ?? err.message : JSON.stringify(err, null, 2)
);
  }
}

export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
