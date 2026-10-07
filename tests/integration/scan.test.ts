import { Types } from "mongoose";
import { afterEach, describe, expect, it } from "vitest";
import { getAuthDb } from "@/lib/db/mongo-client";
import { Exposure } from "@/models/Exposure";
import { Identity } from "@/models/Identity";
import { Scan } from "@/models/Scan";
import type { ExposureProvider } from "@/server/providers/exposure/interface";
import { createMockProvider } from "@/server/providers/exposure/mock";
import { DEFAULT_RETRY_POLICY } from "@/server/services/exposure/resilience";
import { addEmailIdentity } from "@/server/services/identity/identity-service";
import {
  configureScanProcessing,
  getLatestScan,
  getScanForUser,
  getScanQueue,
  manualScanAvailableIn,
  processScan,
  retryFailedSources,
  startManualScan,
} from "@/server/services/scan/scan-service";
import { setupAuthHarness } from "./helpers/auth-harness";

setupAuthHarness();
afterEach(() => configureScanProcessing({}));

const fast = { ...DEFAULT_RETRY_POLICY, attemptTimeoutMs: 150, baseDelayMs: 1, maxDelayMs: 2 };
const ctx = { requestId: "req-scan" };

function use(providers: ExposureProvider[]) {
  configureScanProcessing({ providers, policy: fast });
}

async function verifiedIdentity(email = "owner@example.com") {
  const userId = new Types.ObjectId().toHexString();
  const added = await addEmailIdentity({ userId, accountEmail: email, accountEmailVerified: true }, email, {
    ip: "203.0.113.40",
    requestId: null,
  });
  if (!added.ok) throw new Error("setup");
  return { userId, identityId: added.identityId };
}

async function scanToEnd(userId: string, identityId: string) {
  const started = await startManualScan(userId, identityId, ctx);
  if (!started.ok) throw new Error(`start failed: ${started.reason}`);
  await getScanQueue().drain();
  return (await getScanForUser(userId, started.scanId))!;
}

describe("scan lifecycle", () => {
  it("runs queued → running → normalizing → matching → scoring → completed, persisting each step", async () => {
    use([createMockProvider("multiple", "mock-a")]);
    const who = await verifiedIdentity();
    const scan = await scanToEnd(who.userId, who.identityId);
    expect(scan.state).toBe("completed");
    const doc = await Scan.findById(scan.id).lean();
    expect(doc?.stateHistory.map((h) => h.state)).toEqual([
      "queued",
      "running",
      "normalizing",
      "matching",
      "scoring",
      "completed",
    ]);
    expect(doc?.active).toBeUndefined(); // lock released
    expect(scan.providers).toEqual([
      expect.objectContaining({ name: "mock-a", state: "ok", count: 4, errorCategory: null }),
    ]);
    expect(scan.summary).toMatchObject({
      new: 4,
      activeBySeverity: { critical: 1, high: 1, medium: 1, low: 1, info: 0 },
    });
    expect((await Identity.findById(who.identityId).lean())?.lastScanAt).toBeInstanceOf(Date);
  });

  it("clean result: completed with zero exposures", async () => {
    use([createMockProvider("clean", "mock-a"), createMockProvider("clean", "mock-b")]);
    const who = await verifiedIdentity();
    const scan = await scanToEnd(who.userId, who.identityId);
    expect(scan).toMatchObject({ state: "completed", summary: { new: 0 } });
    expect(await Exposure.countDocuments()).toBe(0);
  });

  it("partial: one source fails, results from the other are kept, failure is per-source", async () => {
    use([createMockProvider("single", "mock-ok"), createMockProvider("failing", "mock-down")]);
    const who = await verifiedIdentity();
    const scan = await scanToEnd(who.userId, who.identityId);
    expect(scan.state).toBe("partial");
    expect(scan.providers.map((p) => [p.name, p.state, p.errorCategory])).toEqual([
      ["mock-ok", "ok", null],
      ["mock-down", "error", "unavailable"],
    ]);
    expect(await Exposure.countDocuments()).toBe(1);
  });

  it("failed: every source failed, safe reason recorded, nothing written, lock released", async () => {
    use([createMockProvider("failing", "mock-down")]);
    const who = await verifiedIdentity();
    const scan = await scanToEnd(who.userId, who.identityId);
    expect(scan).toMatchObject({ state: "failed", failureReason: "all_sources_failed" });
    expect(await Exposure.countDocuments()).toBe(0);
    expect((await Scan.findById(scan.id).lean())?.active).toBeUndefined();
  });

  it("a failed scan doesn't burn the cooldown", async () => {
    use([createMockProvider("failing", "mock-down")]);
    const who = await verifiedIdentity();
    await scanToEnd(who.userId, who.identityId);
    use([createMockProvider("single", "mock-down")]);
    expect(await startManualScan(who.userId, who.identityId, ctx)).toMatchObject({ ok: true, reused: false });
    await getScanQueue().drain();
  });
});

describe("locks, cooldown and idempotency", () => {
  it("returns the scan already in progress instead of starting a second one", async () => {
    use([createMockProvider("slow-timeout", "mock-slow")]);
    const who = await verifiedIdentity();
    const first = await startManualScan(who.userId, who.identityId, ctx);
    const second = await startManualScan(who.userId, who.identityId, ctx);
    expect(first).toMatchObject({ ok: true, reused: false });
    expect(second).toEqual({ ok: true, scanId: (first as { scanId: string }).scanId, reused: true });
    await getScanQueue().drain();
  });

  it("enforces one active scan per identity in the database, even for concurrent starts", async () => {
    use([createMockProvider("single", "mock-a")]);
    const who = await verifiedIdentity();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => startManualScan(who.userId, who.identityId, ctx)),
    );
    const ids = new Set(results.map((r) => (r.ok ? r.scanId : r.reason)));
    expect(ids.size).toBe(1);
    expect(await Scan.countDocuments()).toBe(1);
    await getScanQueue().drain();
  });

  it("applies the 15-minute manual cooldown after a scan and reports when it ends", async () => {
    use([createMockProvider("single", "mock-a")]);
    const who = await verifiedIdentity();
    await scanToEnd(who.userId, who.identityId);
    const again = await startManualScan(who.userId, who.identityId, ctx);
    expect(again).toMatchObject({ ok: false, reason: "cooldown" });
    expect((again as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(14 * 60);
    expect(await manualScanAvailableIn(who.identityId)).toBeGreaterThan(14 * 60);
    expect(
      await startManualScan(who.userId, who.identityId, ctx, new Date(Date.now() + 15 * 60_000 + 1000)),
    ).toMatchObject({ ok: true });
    await getScanQueue().drain();
  });

  it("processes a scan once even if two workers pick it up", async () => {
    use([createMockProvider("multiple", "mock-a")]);
    const who = await verifiedIdentity();
    // Start without letting the queue run it, then race two processors.
    const started = await startManualScan(who.userId, who.identityId, ctx);
    if (!started.ok) throw new Error();
    await Promise.all([processScan(started.scanId), processScan(started.scanId), getScanQueue().drain()]);
    const doc = await Scan.findById(started.scanId).lean();
    expect(doc?.stateHistory.filter((h) => h.state === "running")).toHaveLength(1);
    expect(doc?.state).toBe("completed");
    expect(await Exposure.countDocuments()).toBe(4);
  });

  it("recovers an interrupted scan (process died) so the identity isn't locked forever", async () => {
    use([createMockProvider("single", "mock-a")]);
    const who = await verifiedIdentity();
    const stuck = await Scan.create({
      userId: who.userId,
      identityId: new Types.ObjectId(who.identityId),
      trigger: "manual",
      state: "running",
      active: true,
      stateHistory: [{ state: "running", at: new Date(Date.now() - 10 * 60_000) }],
      providerResults: [{ provider: "mock-a", state: "pending" }],
      lastProgressAt: new Date(Date.now() - 10 * 60_000),
      createdAt: new Date(Date.now() - 20 * 60_000),
    });
    const result = await startManualScan(who.userId, who.identityId, ctx);
    expect(result).toMatchObject({ ok: true, reused: false });
    expect(await Scan.findById(stuck._id).lean()).toMatchObject({
      state: "failed",
      failureReason: "interrupted",
    });
    await getScanQueue().drain();
  });
});

describe("retry failed sources", () => {
  it("rescans only the failed provider and links the retry to the original scan", async () => {
    let healthy = false;
    const flaky: ExposureProvider = {
      ...createMockProvider("single", "mock-flaky"),
      search: async (identifier, c) =>
        healthy
          ? createMockProvider("single").search(identifier, c)
          : { status: "error", category: "unavailable", retryable: false },
    };
    use([createMockProvider("clean", "mock-ok"), flaky]);
    const who = await verifiedIdentity();
    const partial = await scanToEnd(who.userId, who.identityId);
    expect(partial.state).toBe("partial");

    healthy = true;
    const retry = await retryFailedSources(who.userId, partial.id, ctx);
    if (!retry.ok) throw new Error(retry.reason);
    await getScanQueue().drain();
    const retried = await getScanForUser(who.userId, retry.scanId);
    expect(retried).toMatchObject({ state: "completed", trigger: "retry", retryOfScanId: partial.id });
    expect(retried?.providers.map((p) => p.name)).toEqual(["mock-flaky"]);
    expect(await Exposure.countDocuments()).toBe(1);
  });

  it("refuses to retry a completed scan, and limits retries to 3 an hour", async () => {
    use([createMockProvider("single", "mock-ok"), createMockProvider("failing", "mock-down")]);
    const who = await verifiedIdentity();
    const partial = await scanToEnd(who.userId, who.identityId);
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await retryFailedSources(who.userId, partial.id, ctx));
      await getScanQueue().drain();
    }
    expect(results[3]).toMatchObject({ ok: false, reason: "rate_limited" });

    use([createMockProvider("single", "mock-ok")]);
    const other = await verifiedIdentity("someone@example.com");
    const done = await scanToEnd(other.userId, other.identityId);
    expect(await retryFailedSources(other.userId, done.id, ctx)).toEqual({
      ok: false,
      reason: "not_retryable",
    });
  });
});

describe("authorization (scans)", () => {
  it("only verified identities can be scanned", async () => {
    use([createMockProvider("single", "mock-a")]);
    const userId = new Types.ObjectId().toHexString();
    const pending = await addEmailIdentity(
      { userId, accountEmail: "me@example.com", accountEmailVerified: true },
      "other@example.org",
      { ip: "203.0.113.41", requestId: null },
    );
    if (!pending.ok) throw new Error();
    expect(await startManualScan(userId, pending.identityId, ctx)).toEqual({
      ok: false,
      reason: "not_verified",
    });
    expect(await Scan.countDocuments()).toBe(0);
  });

  it("another user can't start, read, or retry scans for someone else's identity", async () => {
    use([createMockProvider("single", "mock-ok"), createMockProvider("failing", "mock-down")]);
    const victim = await verifiedIdentity("victim@example.com");
    const scan = await scanToEnd(victim.userId, victim.identityId);
    const attacker = new Types.ObjectId().toHexString();
    expect(await startManualScan(attacker, victim.identityId, ctx)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await getScanForUser(attacker, scan.id)).toBeNull();
    expect(await getLatestScan(attacker, victim.identityId)).toBeNull();
    expect(await retryFailedSources(attacker, scan.id, ctx)).toEqual({ ok: false, reason: "not_found" });
    for (const bad of ["", "123", '{"$ne":null}']) expect(await getScanForUser(attacker, bad)).toBeNull();
  });

  it("scan records hold no identifier", async () => {
    use([createMockProvider("multiple", "mock-a")]);
    const who = await verifiedIdentity("hidden.person@example.com");
    await scanToEnd(who.userId, who.identityId);
    const dump = JSON.stringify(await getAuthDb().collection("scans").find({}).toArray());
    expect(dump).not.toContain("hidden.person");
  });

  it("audits start and completion with IDs only", async () => {
    use([createMockProvider("single", "mock-a")]);
    const who = await verifiedIdentity();
    await scanToEnd(who.userId, who.identityId);
    const events = (await getAuthDb().collection("auditLogs").find({}).toArray()).map((e) => e.event);
    expect(events).toEqual(expect.arrayContaining(["SCAN_STARTED", "SCAN_COMPLETED", "EXPOSURE_DETECTED"]));
  });
});
