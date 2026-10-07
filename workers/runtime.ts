import { Queue, Worker } from "bullmq";
import { getEnv } from "@/config/env";
import { logger } from "@/lib/logging/logger";
import {
  createBullmqConnection,
  MONITORING_QUEUE_NAME,
  QUEUE_PREFIX,
  SCAN_QUEUE_NAME,
} from "@/lib/redis/bullmq";
import { runMonitoringTick } from "@/server/services/monitoring/monitoring-service";
import { createBullmqScanQueue, type ScanJobData } from "@/server/services/scan/bullmq-queue";
import { processScan, setScanQueue } from "@/server/services/scan/scan-service";

/**
 * The worker's moving parts, built by a factory so tests can run them with an
 * isolated queue prefix (D-032). `workers/index.ts` is the process entrypoint.
 */
export interface WorkerRuntime {
  scanWorker: Worker<ScanJobData>;
  monitoringWorker: Worker;
  monitoringQueue: Queue;
  close(): Promise<void>;
}

export interface RuntimeOptions {
  prefix?: string;
  concurrency?: number;
  tickMs?: number;
  /** Run a monitoring tick immediately (reconcile overdue schedules after downtime). */
  tickOnStart?: boolean;
}

export async function startWorkerRuntime(options: RuntimeOptions = {}): Promise<WorkerRuntime> {
  const env = getEnv();
  const prefix = options.prefix ?? QUEUE_PREFIX;
  // Scheduled scans started by the worker go through BullMQ too, so the concurrency limit applies to them.
  const scanQueue = createBullmqScanQueue(prefix);
  setScanQueue(scanQueue);

  const scanWorker = new Worker<ScanJobData>(
    SCAN_QUEUE_NAME,
    async (job) => {
      // processScan is idempotent: a retried or duplicated job for a finished scan is a no-op.
      await processScan(job.data.scanId);
    },
    {
      connection: createBullmqConnection(),
      prefix,
      concurrency: options.concurrency ?? env.WORKER_CONCURRENCY,
    },
  );

  const monitoringQueue = new Queue(MONITORING_QUEUE_NAME, { connection: createBullmqConnection(), prefix });
  const monitoringWorker = new Worker(MONITORING_QUEUE_NAME, async () => runMonitoringTick(), {
    connection: createBullmqConnection(),
    prefix,
    // One tick at a time per worker; claims are atomic across workers anyway.
    concurrency: 1,
  });
  await monitoringQueue.upsertJobScheduler(
    "monitoring-tick",
    { every: options.tickMs ?? env.MONITORING_TICK_MS },
    { name: "tick", opts: { removeOnComplete: { count: 100 }, removeOnFail: { age: 24 * 60 * 60 } } },
  );

  for (const worker of [scanWorker, monitoringWorker]) {
    // Job IDs only: payloads hold IDs, never identifiers.
    worker.on("failed", (job, error) =>
      logger.error(
        { queue: worker.name, jobId: job?.id, attempts: job?.attemptsMade, err: error.name },
        "job failed",
      ),
    );
    worker.on("error", (error) => logger.error({ queue: worker.name, err: error.name }, "worker error"));
  }

  if (options.tickOnStart ?? true) {
    await runMonitoringTick().catch((error: unknown) =>
      logger.error({ err: error instanceof Error ? error.name : "unknown" }, "startup reconcile failed"),
    );
  }

  return {
    scanWorker,
    monitoringWorker,
    monitoringQueue,
    async close() {
      // Waits for in-flight jobs to finish before resolving (graceful shutdown).
      await Promise.all([scanWorker.close(), monitoringWorker.close()]);
      await monitoringQueue.removeJobScheduler("monitoring-tick").catch(() => undefined);
      await Promise.all([monitoringQueue.close(), scanQueue.close()]);
      setScanQueue(undefined);
    },
  };
}
