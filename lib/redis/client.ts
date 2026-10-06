import Redis from "ioredis";
import { getEnv } from "@/config/env";
import { logger } from "@/lib/logging/logger";

/**
 * Shared Redis connection (rate limits now, BullMQ in M2). Commands may queue
 * briefly while connecting, but every command times out after 2s, so when
 * Redis is down auth rate limits fail closed promptly instead of hanging.
 */
const globalCache = globalThis as typeof globalThis & { __exovaultRedis?: Redis };

export function getRedis(): Redis {
  if (!globalCache.__exovaultRedis) {
    const client = new Redis(getEnv().REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5_000,
      commandTimeout: 2_000,
    });
    // Without a listener ioredis prints every reconnect error; log once per state change instead.
    let lastError: string | undefined;
    client.on("error", (error: Error) => {
      if (error.message === lastError) return;
      lastError = error.message;
      logger.error({ component: "redis", err: error.name }, "redis connection error");
    });
    client.on("ready", () => {
      lastError = undefined;
    });
    globalCache.__exovaultRedis = client;
  }
  return globalCache.__exovaultRedis;
}

export async function closeRedis(): Promise<void> {
  const client = globalCache.__exovaultRedis;
  globalCache.__exovaultRedis = undefined;
  if (client) await client.quit().catch(() => client.disconnect());
}
