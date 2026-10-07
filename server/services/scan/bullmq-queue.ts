import { Queue } from "bullmq";
import { createBullmqConnection, QUEUE_PREFIX, SCAN_QUEUE_NAME } from "@/lib/redis/bullmq";
import type { ScanQueue } from "./queue";

/** Job payload: IDs only, never identifiers (spec 4.2, THREAT-MODEL Redis row). */
export interface ScanJobData {
  scanId: string;
}

/**
 * BullMQ adapter for the ScanQueue interface (D-032). The worker process
 * consumes the jobs; the web process only enqueues. Retries with exponential
 * backoff; failed jobs are kept for 7 days as the dead-letter record.
 */
export function createBullmqScanQueue(
  prefix = QUEUE_PREFIX,
): ScanQueue & { queue: Queue<ScanJobData>; close(): Promise<void> } {
  const queue = new Queue<ScanJobData>(SCAN_QUEUE_NAME, { connection: createBullmqConnection(), prefix });
  return {
    queue,
    enqueue(scanId) {
      void queue
        .add(
          "scan",
          { scanId },
          {
            // Same scan enqueued twice → one job.
            jobId: `scan-${scanId}`,
            attempts: 3,
            backoff: { type: "exponential", delay: 5_000 },
            removeOnComplete: { age: 60 * 60, count: 1_000 },
            removeOnFail: { age: 7 * 24 * 60 * 60 },
          },
        )
        .catch(() => {
          // The scan stays queued; stale-scan recovery (D-029) frees the identity if it's never picked up.
        });
    },
    async drain() {
      for (;;) {
        const counts = await queue.getJobCounts("waiting", "active", "delayed", "prioritized");
        if (Object.values(counts).every((n) => n === 0)) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    },
    close: () => queue.close(),
  };
}
