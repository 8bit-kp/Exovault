/**
 * Exovault worker: a separate long-running Node process (spec 4.2). Runs
 * scans from the BullMQ "scans" queue and the scheduled-monitoring tick.
 *
 *   dev:  npm run worker            (tsx, reads .env.local)
 *   prod: npm run worker:build && node --conditions=react-server dist/worker.js
 */
import { getEnv } from "@/config/env";
import { closeMongoClient } from "@/lib/db/mongo-client";
import { connectToDatabase, disconnectFromDatabase } from "@/lib/db/mongoose";
import { logger } from "@/lib/logging/logger";
import { closeRedis } from "@/lib/redis/client";
import { startWorkerRuntime } from "./runtime";

const SHUTDOWN_TIMEOUT_MS = 30_000;

async function main() {
  const env = getEnv();
  await connectToDatabase();
  const runtime = await startWorkerRuntime();
  logger.info({ concurrency: env.WORKER_CONCURRENCY, tickMs: env.MONITORING_TICK_MS }, "worker started");

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "worker shutting down: finishing in-flight jobs");
    const force = setTimeout(() => {
      logger.error("shutdown timed out; exiting");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    force.unref();
    await runtime.close();
    await Promise.allSettled([disconnectFromDatabase(), closeMongoClient(), closeRedis()]);
    logger.info("worker stopped");
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  logger.fatal({ err: error instanceof Error ? error.message : "unknown" }, "worker failed to start");
  process.exit(1);
});
