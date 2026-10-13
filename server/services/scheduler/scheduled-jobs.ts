import "server-only";
import { timingSafeEqual } from "node:crypto";
import { cronDueBy } from "@/lib/domain/monitoring";
import { logger } from "@/lib/logging/logger";
import { purgeDueAccounts } from "@/server/services/account/account-deletion-service";
import { resetDemoAccountIfEnabled } from "@/server/services/demo/demo-account";
import { runMonitoringTick } from "@/server/services/monitoring/monitoring-service";
import { dispatchDueNotifications } from "@/server/services/notification/notification-service";
import { createInProcessQueue } from "@/server/services/scan/queue";
import { processScan } from "@/server/services/scan/scan-service";

/**
 * Everything the worker's periodic jobs do, as one run for a platform cron
 * (D-039). Order matters: the scans this run starts are awaited before alerts
 * are dispatched, so their findings go out in the same run rather than a day
 * later. Every step is already safe to run concurrently and to repeat.
 */
export async function runScheduledJobs(
  intervalMinutes: number,
  now = new Date(),
): Promise<{
  claimed: number;
  started: number;
  alertsSent: number;
  emails: number;
  purged: number;
  demoReset: boolean;
}> {
  // Its own queue, so this run waits on exactly the scans it started.
  const queue = createInProcessQueue((scanId) => processScan(scanId), 2);
  const tick = await runMonitoringTick(now, { dueBy: cronDueBy(now, intervalMinutes), queue });
  await queue.drain();
  // A fresh clock: alerts from this run's scans are scheduled for when those scans finished.
  const dispatched = await dispatchDueNotifications(new Date());
  const { purged } = await purgeDueAccounts(now);
  // Showcase deployments (D-041): undo whatever visitors changed on the shared demo account.
  const demoReset = await resetDemoAccountIfEnabled();
  const summary = { ...tick, alertsSent: dispatched.sent, emails: dispatched.emails, purged, demoReset };
  logger.info(summary, "scheduled jobs run");
  return summary;
}

/** Constant-time check of `Authorization: Bearer <secret>`. Never true without a configured secret. */
export function isAuthorizedCronRequest(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
