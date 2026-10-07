import { Types } from "mongoose";
import { afterEach, describe, expect, it } from "vitest";
import { getAuthDb } from "@/lib/db/mongo-client";
import { RiskScore } from "@/models/RiskScore";
import { createMockProvider } from "@/server/providers/exposure/mock";
import { listRecentActivity } from "@/server/services/activity/activity-service";
import { activeSeverityCounts, listExposuresForUser } from "@/server/services/exposure/exposure-query";
import { DEFAULT_RETRY_POLICY } from "@/server/services/exposure/resilience";
import { listTimeline, parseTimelineFilters } from "@/server/services/exposure/timeline-query";
import { addEmailIdentity, removeIdentity } from "@/server/services/identity/identity-service";
import { getRiskScores } from "@/server/services/risk/risk-service";
import { configureScanProcessing, getScanQueue, startManualScan } from "@/server/services/scan/scan-service";
import { setupAuthHarness } from "./helpers/auth-harness";

setupAuthHarness();
afterEach(() => configureScanProcessing({}));

const fast = { ...DEFAULT_RETRY_POLICY, attemptTimeoutMs: 150, baseDelayMs: 1, maxDelayMs: 2 };

async function scannedUser(email: string, scenario: "multiple" | "clean" = "multiple") {
  configureScanProcessing({ providers: [createMockProvider(scenario, "mock-a")], policy: fast });
  const userId = new Types.ObjectId().toHexString();
  const added = await addEmailIdentity({ userId, accountEmail: email, accountEmailVerified: true }, email, {
    ip: "203.0.113.50",
    requestId: null,
  });
  if (!added.ok) throw new Error("setup");
  const started = await startManualScan(userId, added.identityId, { requestId: null });
  if (!started.ok) throw new Error(started.reason);
  await getScanQueue().drain();
  return { userId, identityId: added.identityId, scanId: started.scanId };
}

describe("risk score snapshots", () => {
  it("the scan's scoring step stores a snapshot with its methodology version and scan link", async () => {
    const who = await scannedUser("a@example.com");
    const { current, previous } = await getRiskScores(who.userId);
    expect(current?.score).toBeGreaterThan(0);
    expect(current?.methodologyVersion).toBe("risk-2026-10.1");
    expect(current?.factors.length).toBeGreaterThan(0);
    expect(previous).toBeNull();
    const doc = await RiskScore.findOne({ userId: who.userId }).lean();
    expect(String(doc?.scanId)).toBe(who.scanId);
  });

  it("a clean scan scores 0 with an explanatory factor", async () => {
    const who = await scannedUser("b@example.com", "clean");
    const { current } = await getRiskScores(who.userId);
    expect(current).toMatchObject({ score: 0, band: "minimal" });
    expect(current?.factors.map((f) => f.key)).toEqual(["no_exposures"]);
  });

  it("removing the identity recomputes the score from what's left", async () => {
    const who = await scannedUser("c@example.com");
    await removeIdentity({ userId: who.userId }, who.identityId, { ip: "x", requestId: null });
    const { current, previous } = await getRiskScores(who.userId);
    expect(current?.score).toBe(0);
    expect(previous?.score).toBeGreaterThan(0);
  });

  it("snapshots belong to their user only", async () => {
    const who = await scannedUser("d@example.com");
    expect((await getRiskScores(new Types.ObjectId().toHexString())).current).toBeNull();
    expect(await RiskScore.countDocuments({ userId: who.userId })).toBe(1);
  });
});

describe("dashboard read models", () => {
  it("counts only active exposures by severity", async () => {
    const who = await scannedUser("e@example.com");
    expect(await activeSeverityCounts(who.userId)).toEqual({
      critical: 1,
      high: 1,
      medium: 1,
      low: 1,
      info: 0,
    });
    await getAuthDb()
      .collection("exposures")
      .updateOne({ userId: who.userId, severity: "critical" }, { $set: { remediationState: "remediated" } });
    expect((await activeSeverityCounts(who.userId)).critical).toBe(0);
  });

  it("orders exposures active-first, most severe first", async () => {
    const who = await scannedUser("f@example.com");
    const list = await listExposuresForUser(who.userId);
    expect(list.map((e) => e.severity)).toEqual(["critical", "high", "medium", "low"]);
  });

  it("projects the user's own audit events into recent activity, without identifiers", async () => {
    const who = await scannedUser("private.person@example.com");
    const other = await scannedUser("someone.else@example.com");
    const activity = await listRecentActivity(who.userId);
    expect(activity.map((a) => a.kind)).toEqual(
      expect.arrayContaining(["scan_completed", "exposure_detected", "identity_verified"]),
    );
    expect(JSON.stringify(activity)).not.toContain("private.person");
    const otherIds = (await listRecentActivity(other.userId)).map((a) => a.id);
    expect(activity.some((a) => otherIds.includes(a.id))).toBe(false);
  });
});

describe("timeline query (spec 13.7)", () => {
  it("filters server-side and scopes to the user", async () => {
    const who = await scannedUser("timeline@example.com");
    const other = await scannedUser("timeline.other@example.com");
    const all = await listTimeline(who.userId, parseTimelineFilters({}));
    expect(all.total).toBe(4);
    expect(all.items.every((e) => e.identityMasked === "t****e@example.com")).toBe(true);

    expect((await listTimeline(who.userId, parseTimelineFilters({ severity: "critical" }))).total).toBe(1);
    expect((await listTimeline(who.userId, parseTimelineFilters({ status: "remediated" }))).total).toBe(0);
    expect((await listTimeline(who.userId, parseTimelineFilters({ identity: other.identityId }))).total).toBe(
      0,
    );
    expect(
      (await listTimeline(who.userId, parseTimelineFilters({ from: "2000-01", to: "2000-12" }))).total,
    ).toBe(0);
  });

  it("ignores invalid or injection-shaped filters instead of trusting them", () => {
    expect(
      parseTimelineFilters({
        severity: '{"$ne":null}',
        status: "x",
        identity: "zz",
        from: "2026-13",
        page: "-3",
      }),
    ).toEqual({ page: 1 });
  });

  it("paginates 20 per page, newest first, and clamps out-of-range pages", async () => {
    const who = await scannedUser("pages@example.com");
    const base = await getAuthDb().collection("exposures").findOne({ userId: who.userId });
    const extra = Array.from({ length: 30 }, (_, i) => ({
      ...base,
      _id: new Types.ObjectId(),
      fingerprint: i.toString(16).padStart(64, "0"),
      firstSeenAt: new Date(Date.UTC(2026, 0, 1 + i)),
    }));
    await getAuthDb().collection("exposures").insertMany(extra);
    const first = await listTimeline(who.userId, parseTimelineFilters({}));
    expect(first).toMatchObject({ total: 34, pages: 2, page: 1 });
    expect(first.items).toHaveLength(20);
    const times = first.items.map((e) => Date.parse(e.discoveredAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    expect((await listTimeline(who.userId, parseTimelineFilters({ page: "99" }))).page).toBe(2);
  });
});
