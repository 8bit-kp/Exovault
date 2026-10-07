import Redis from "ioredis";
import { getEnv } from "@/config/env";

/**
 * BullMQ connections (D-032). BullMQ needs `maxRetriesPerRequest: null` so
 * blocking commands wait instead of erroring; that's why this isn't the
 * shared fail-fast client used for rate limits.
 */
export const QUEUE_PREFIX = "exovault";
export const SCAN_QUEUE_NAME = "scans";
export const MONITORING_QUEUE_NAME = "monitoring";

export function createBullmqConnection(): Redis {
  return new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });
}
