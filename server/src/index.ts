import { createServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { connectMongo, disconnectMongo } from "./config/db.js";
import { connectRedis, disconnectRedis } from "./config/redis.js";
import { registerSocketHandlers } from "./sockets/index.js";
import { setSocketServer } from "./sockets/io.js";
import { ensureBotUser } from "./modules/bot/bot.service.js";
import { logger } from "./utils/logger.js";

async function bootstrap(): Promise<void> {
  // External connections degrade gracefully in Sprint 0 (warn instead of crash).
  await connectMongo();
  const redis = await connectRedis();

  // Dev/test bot (no-op when disabled or DB is unavailable).
  await ensureBotUser();

  const app = createApp();
  const httpServer = createServer(app);

  const io = new SocketIOServer(httpServer, {
    cors: { origin: env.CLIENT_URL, credentials: true },
  });

  // Multi-instance scaling (blueprint §16): attach the Redis adapter when Redis is available.
  if (redis) {
    io.adapter(createAdapter(redis.pub, redis.sub));
    logger.info("Socket.IO Redis adapter attached");
  } else {
    logger.warn("Socket.IO running without Redis adapter (single-instance only)");
  }

  setSocketServer(io);
  registerSocketHandlers(io);

  httpServer.listen(env.PORT, () => {
    logger.info(`Linkr server listening on http://localhost:${env.PORT}`, { env: env.NODE_ENV });
  });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal} — shutting down gracefully`);
    io.close();
    httpServer.close();
    await disconnectRedis();
    await disconnectMongo();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

bootstrap().catch((err) => {
  logger.error("Fatal error during startup", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
