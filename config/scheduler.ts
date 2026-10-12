import { getEnv } from "@/config/env";

/**
 * How scheduled work runs on this deployment (D-039). `null` interval means
 * the long-running worker (every frequency is available, ticks every minute).
 */
export function cronIntervalMinutes(): number | null {
  const env = getEnv();
  return env.SCHEDULER === "cron" ? env.CRON_INTERVAL_MINUTES : null;
}
