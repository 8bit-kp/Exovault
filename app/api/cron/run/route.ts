import { getEnv } from "@/config/env";
import { json } from "@/lib/http/responses";
import { isAuthorizedCronRequest, runScheduledJobs } from "@/server/services/scheduler/scheduled-jobs";

/** Scans started by the run are awaited inside it; give it the platform's full budget. */
export const maxDuration = 300;

/**
 * Scheduled work for deployments without the worker (`SCHEDULER=cron`, D-039):
 * Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. It does
 * what the worker's periodic jobs do: monitoring tick (and its scans), alert
 * dispatch, account purge. With the worker it doesn't exist (404).
 */
export async function GET(request: Request) {
  const env = getEnv();
  if (env.SCHEDULER !== "cron") return json({ error: "not_found" }, 404);
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), env.CRON_SECRET)) {
    return json({ error: "unauthorized" }, 401);
  }
  return json(await runScheduledJobs(env.CRON_INTERVAL_MINUTES));
}
