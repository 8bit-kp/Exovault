import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Identity } from "@/models/Identity";
import { Scan } from "@/models/Scan";
import type { ExposureProvider } from "@/server/providers/exposure/interface";
import { createMockProvider } from "@/server/providers/exposure/mock";
import { DEFAULT_RETRY_POLICY } from "@/server/services/exposure/resilience";
import { addEmailIdentity, removeIdentity } from "@/server/services/identity/identity-service";
import {
  claimDueIdentities,
  disableMonitoring,
  enableMonitoring,
  getMonitoringView,
  runMonitoringTick,
} from "@/server/services/monitoring/monitoring-service";
import { configureScanProcessing, getScanQueue, startManualScan } from "@/server/services/scan/scan-service";
import { startWorkerRuntime, type WorkerRuntime } from "@/workers/runtime";
import { setupAuthHarness } from "./helpers/auth-harness";

setupAuthHarness();

const fast = { ...DEFAULT_RETRY_POLICY, attemptTimeoutMs: 150, baseDelayMs: 1, maxDelayMs: 2 };
const ctx = { requestId: "req-worker" };
let runtime: WorkerRuntime | undefined;

async function start(providers: ExposureProvider[] = [createMockProvider("single", "mock-a")]) {
  configureScanProcessing({ providers, policy: fast });
  runtime = await startWorkerRuntime({
    prefix: `exovault-test-${randomUUID()}`,
    tickOnStart: false,
    concurrency: 2,
  });
  return runtime;
}

beforeEach(() => {
  runtime = undefined;
});
afterEach(async () => {
  await runtime?.close();
  configureScanProcessing({});
});

async function verifiedIdentity(email = "owner@example.com") {
  const userId = new Types.ObjectId().toHexString();
  const added = await addEmailIdentity({ userId, accountEmail: email, accountEmailVerified: true }, email, {
    ip: "203.0.113.70",
    requestId: null,
  });
  if (!added.ok) throw new Error("setup");
  return { userId, identityId: added.identityId };
}

async function waitForTerminal(scanId: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const scan = await Scan.findById(scanId).lean();
    if (scan && ["completed", "partial", "failed"].includes(scan.state)) return scan;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("scan did not finish");
}

describe("BullMQ worker", () => {
  it("runs a manual scan enqueued by the web side, with a job payload of IDs only", async () => {
    await start();
    const who = await verifiedIdentity("job.payload@example.com");
    const started = await startManualScan(who.userId, who.identityId, ctx);
    if (!started.ok) throw new Error(started.reason);
    const scan = await waitForTerminal(started.scanId);
    expect(scan.state).toBe("completed");
    const queue = (
      getScanQueue() as unknown as { queue: { getJob(id: string): Promise<{ data: unknown } | undefined> } }
    ).queue;
    const stored = await queue.getJob(`scan-${started.scanId}`);
    if (stored) {
      expect(stored.data).toEqual({ scanId: started.scanId });
      expect(JSON.stringify(stored.data)).not.toContain("job.payload");
    }
  });

  it("registers the monitoring tick as a job scheduler", async () => {
    const rt = await start();
    const scheduler = await rt.monitoringQueue.getJobScheduler("monitoring-tick");
    expect(scheduler?.every).toBe(60_000);
  });

  it("closes gracefully: in-flight scans finish before close() resolves", async () => {
    const slow: ExposureProvider = {
      ...createMockProvider("single", "mock-slow"),
      search: async (identifier, c) => {
        await new Promise((r) => setTimeout(r, 120));
        return createMockProvider("single").search(identifier, c);
      },
    };
    const rt = await start([slow]);
    const who = await verifiedIdentity();
    const started = await startManualScan(who.userId, who.identityId, ctx);
    if (!started.ok) throw new Error();
    // Wait until the worker has picked it up.
    for (let i = 0; i < 100; i++) {
      if ((await Scan.findById(started.scanId).lean())?.state !== "queued") break;
      await new Promise((r) => setTimeout(r, 20));
    }
    await rt.close();
    runtime = undefined;
    expect((await Scan.findById(started.scanId).lean())?.state).toBe("completed");
  });
});

describe("scheduled monitoring", () => {
  it("enables monitoring with a validated frequency and schedules the first scan soon", async () => {
    const who = await verifiedIdentity();
    const now = new Date();
    const result = await enableMonitoring(who.userId, who.identityId, "12h", ctx, now);
    expect(result.ok).toBe(true);
    const view = await getMonitoringView(who.userId, who.identityId);
    expect(view).toMatchObject({ state: "active", frequency: "12h" });
    const delta = Date.parse(view!.nextScanAt!) - now.getTime();
    expect(delta).toBeGreaterThanOrEqual(60_000);
    expect(delta).toBeLessThanOrEqual(5 * 60_000);
    expect(await enableMonitoring(who.userId, who.identityId, "1m", ctx)).toEqual({
      ok: false,
      reason: "invalid_frequency",
    });
  });

  it("a due identity gets exactly one scheduled scan, processed by the worker, and its next time moves on", async () => {
    await start();
    const who = await verifiedIdentity();
    await enableMonitoring(who.userId, who.identityId, "6h", ctx);
    await Identity.updateOne(
      { _id: who.identityId },
      { $set: { "monitoring.nextScanAt": new Date(Date.now() - 1000) } },
    );

    const tick = await runMonitoringTick();
    expect(tick).toEqual({ claimed: 1, started: 1 });
    const scan = await Scan.findOne({
      identityId: new Types.ObjectId(who.identityId),
      trigger: "scheduled",
    }).lean();
    expect((await waitForTerminal(String(scan!._id))).state).toBe("completed");

    const next = (await Identity.findById(who.identityId).lean())!.monitoring!.nextScanAt!;
    const hours = (next.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(5.3);
    expect(hours).toBeLessThan(6.7);
    // Not due any more.
    expect(await runMonitoringTick()).toEqual({ claimed: 0, started: 0 });
  });

  it("concurrent ticks (several workers) never double-schedule an identity", async () => {
    const who = await verifiedIdentity();
    await enableMonitoring(who.userId, who.identityId, "24h", ctx);
    await Identity.updateOne(
      { _id: who.identityId },
      { $set: { "monitoring.nextScanAt": new Date(Date.now() - 1000) } },
    );
    const results = await Promise.all(Array.from({ length: 5 }, () => claimDueIdentities()));
    expect(results.flat()).toHaveLength(1);
  });

  it("reconciles after downtime: an identity overdue by days gets one scan, not one per missed slot", async () => {
    await start();
    const who = await verifiedIdentity();
    await enableMonitoring(who.userId, who.identityId, "6h", ctx);
    await Identity.updateOne(
      { _id: who.identityId },
      { $set: { "monitoring.nextScanAt": new Date(Date.now() - 5 * 24 * 3_600_000) } },
    );
    await runMonitoringTick();
    await runMonitoringTick();
    expect(
      await Scan.countDocuments({ identityId: new Types.ObjectId(who.identityId), trigger: "scheduled" }),
    ).toBe(1);
  });

  it("never schedules disabled, unverified or removed identities", async () => {
    const off = await verifiedIdentity("off@example.com");
    await enableMonitoring(off.userId, off.identityId, "6h", ctx);
    await disableMonitoring(off.userId, off.identityId, ctx);

    const removed = await verifiedIdentity("removed@example.com");
    await enableMonitoring(removed.userId, removed.identityId, "6h", ctx);
    await Identity.updateMany({}, { $set: { "monitoring.nextScanAt": new Date(Date.now() - 1000) } });
    await removeIdentity({ userId: removed.userId }, removed.identityId, { ip: "x", requestId: null });

    const userId = new Types.ObjectId().toHexString();
    const pending = await addEmailIdentity(
      { userId, accountEmail: "me@example.com", accountEmailVerified: true },
      "x@example.org",
      {
        ip: "x",
        requestId: null,
      },
    );
    if (!pending.ok) throw new Error();
    expect(await enableMonitoring(userId, pending.identityId, "6h", ctx)).toEqual({
      ok: false,
      reason: "not_verified",
    });
    await Identity.updateOne(
      { _id: pending.identityId },
      {
        $set: {
          "monitoring.enabled": true,
          "monitoring.frequency": "6h",
          "monitoring.nextScanAt": new Date(0),
        },
      },
    );

    expect(await claimDueIdentities()).toEqual([]);
  });

  it("disabling cancels a scheduled scan that hasn't started", async () => {
    const who = await verifiedIdentity();
    await enableMonitoring(who.userId, who.identityId, "6h", ctx);
    const queued = await Scan.create({
      userId: who.userId,
      identityId: new Types.ObjectId(who.identityId),
      trigger: "scheduled",
      state: "queued",
      active: true,
      stateHistory: [{ state: "queued", at: new Date() }],
      providerResults: [{ provider: "mock-a", state: "pending" }],
      lastProgressAt: new Date(),
    });
    await disableMonitoring(who.userId, who.identityId, ctx);
    expect(await Scan.findById(queued._id).lean()).toMatchObject({
      state: "failed",
      failureReason: "cancelled",
    });
    expect(await getMonitoringView(who.userId, who.identityId)).toMatchObject({
      state: "off",
      nextScanAt: null,
    });
  });

  it("reports degraded when the latest scheduled scan failed", async () => {
    await start([createMockProvider("failing", "mock-down")]);
    const who = await verifiedIdentity();
    await enableMonitoring(who.userId, who.identityId, "6h", ctx);
    await Identity.updateOne(
      { _id: who.identityId },
      { $set: { "monitoring.nextScanAt": new Date(Date.now() - 1000) } },
    );
    await runMonitoringTick();
    const scan = await Scan.findOne({ trigger: "scheduled" }).lean();
    await waitForTerminal(String(scan!._id));
    expect((await getMonitoringView(who.userId, who.identityId))?.state).toBe("degraded");
  });

  it("another user can't enable, disable or read monitoring for someone else's identity", async () => {
    const victim = await verifiedIdentity("victim@example.com");
    const attacker = new Types.ObjectId().toHexString();
    expect(await enableMonitoring(attacker, victim.identityId, "6h", ctx)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await disableMonitoring(attacker, victim.identityId, ctx)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await getMonitoringView(attacker, victim.identityId)).toBeNull();
  });
});
