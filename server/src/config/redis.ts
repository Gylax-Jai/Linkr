import { Redis } from "ioredis";
import { env, features } from "./env.js";
import { logger } from "../utils/logger.js";

/**
 * Redis powers presence and the Socket.IO adapter (blueprint §3). Graceful by design:
 * if REDIS_URL is missing we return null and the server runs single-node without an adapter.
 */
let pubClient: Redis | null = null;
let subClient: Redis | null = null;

export interface RedisClients {
  pub: Redis;
  sub: Redis;
}

export async function connectRedis(): Promise<RedisClients | null> {
  if (!features.redis || !env.REDIS_URL) {
    logger.warn("REDIS_URL not set — skipping Redis (presence + socket adapter disabled in Sprint 0)");
    return null;
  }

  try {
    // lazyConnect lets us surface connection errors here instead of crashing on first command.
    pubClient = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 2 });
    pubClient.on("error", (err) => logger.error("Redis error", String(err)));
    await pubClient.connect();

    subClient = pubClient.duplicate();
    await subClient.connect();

    logger.info("Redis connected");
    return { pub: pubClient, sub: subClient };
  } catch (err) {
    logger.error("Failed to connect to Redis (continuing without it)", String(err));
    pubClient?.disconnect();
    subClient?.disconnect();
    pubClient = null;
    subClient = null;
    return null;
  }
}

export async function disconnectRedis(): Promise<void> {
  pubClient?.disconnect();
  subClient?.disconnect();
  pubClient = null;
  subClient = null;
}

export function isRedisConnected(): boolean {
  return pubClient?.status === 'ready';
}
