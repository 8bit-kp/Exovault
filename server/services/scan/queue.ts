import { logger } from "@/lib/logging/logger";

/**
 * Scan queue abstraction (spec Part 8). M1 uses the in-process adapter below;
 * M2 swaps in BullMQ behind the same interface without changing callers.
 * In-process means a scan runs inside the web process: fine for a single Node
 * server (`next start`), NOT for serverless (DEPLOYMENT.md, D-029).
 */
export interface ScanQueue {
  enqueue(scanId: string): void;
  /** Resolves when nothing is queued or running (tests, graceful shutdown). */
  drain(): Promise<void>;
}

export function createInProcessQueue(process: (scanId: string) => Promise<void>, concurrency = 4): ScanQueue {
  const waiting: string[] = [];
  let running = 0;
  let idleResolvers: Array<() => void> = [];

  const settleIdle = () => {
    if (running === 0 && waiting.length === 0) {
      idleResolvers.forEach((resolve) => resolve());
      idleResolvers = [];
    }
  };

  const pump = () => {
    while (running < concurrency && waiting.length > 0) {
      const scanId = waiting.shift()!;
      running += 1;
      process(scanId)
        .catch((error: unknown) =>
          logger.error(
            { scanId, err: error instanceof Error ? error.name : "unknown" },
            "scan processing crashed",
          ),
        )
        .finally(() => {
          running -= 1;
          pump();
          settleIdle();
        });
    }
  };

  return {
    enqueue(scanId) {
      waiting.push(scanId);
      // Defer so the caller's response isn't delayed by the scan.
      setImmediate(pump);
    },
    drain() {
      if (running === 0 && waiting.length === 0) return Promise.resolve();
      return new Promise((resolve) => idleResolvers.push(resolve));
    },
  };
}
