import { Types } from "mongoose";
import { afterEach, describe, expect, it } from "vitest";
import { getAuthDb } from "@/lib/db/mongo-client";
import { Exposure } from "@/models/Exposure";
import { RemediationAction } from "@/models/RemediationAction";
import { RiskScore } from "@/models/RiskScore";
import { createMockProvider } from "@/server/providers/exposure/mock";
import { DEFAULT_RETRY_POLICY } from "@/server/services/exposure/resilience";
import { addEmailIdentity, removeIdentity } from "@/server/services/identity/identity-service";
import {
  getExposureDetail,
  revealSensitiveSource,
  setChecklistItem,
  setRemediationState,
} from "@/server/services/remediation/remediation-service";
import { getRiskScores } from "@/server/services/risk/risk-service";
import { configureScanProcessing, getScanQueue, startManualScan } from "@/server/services/scan/scan-service";
import { setupAuthHarness } from "./helpers/auth-harness";

setupAuthHarness();
afterEach(() => configureScanProcessing({}));

const ctx = { requestId: "req-rem" };
const fast = { ...DEFAULT_RETRY_POLICY, attemptTimeoutMs: 150, baseDelayMs: 1, maxDelayMs: 2 };

async function scanned(email = "owner@example.com") {
  configureScanProcessing({ providers: [createMockProvider("multiple", "mock-a")], policy: fast });
  const userId = new Types.ObjectId().toHexString();
  const added = await addEmailIdentity({ userId, accountEmail: email, accountEmailVerified: true }, email, {
    ip: "203.0.113.60",
    requestId: null,
  });
  if (!added.ok) throw new Error("setup");
  const started = await startManualScan(userId, added.identityId, ctx);
  if (!started.ok) throw new Error(started.reason);
  await getScanQueue().drain();
  const critical = await Exposure.findOne({ userId, severity: "critical" }).lean();
  const sensitive = await Exposure.findOne({ userId, isSensitiveSource: true }).lean();
  return {
    userId,
    identityId: added.identityId,
    criticalId: String(critical!._id),
    sensitiveId: String(sensitive!._id),
  };
}

describe("exposure detail", () => {
  it("shows exposed and notable not-detected categories, the checklist and provenance", async () => {
    const who = await scanned();
    const detail = await getExposureDetail(who.userId, who.criticalId);
    expect(detail).toMatchObject({
      severity: "critical",
      remediationState: "open",
      sensitive: false,
      sourceName: "Northwind Rewards (fictional)",
      identityMasked: "o****r@example.com",
      isDemo: true,
    });
    expect(detail?.exposed).toEqual(expect.arrayContaining(["email", "password_plaintext", "phone"]));
    expect(detail?.notDetected).toEqual(expect.arrayContaining(["financial", "government_id"]));
    expect(detail?.notDetected).not.toContain("phone");
    expect(detail?.checklist.map((i) => i.key)).toContain("change-password");
    expect(detail?.checklist.every((i) => !i.done)).toBe(true);
  });

  it("hides a sensitive source's name until it's explicitly revealed, and audits the reveal", async () => {
    const who = await scanned();
    const detail = await getExposureDetail(who.userId, who.sensitiveId);
    expect(detail).toMatchObject({ sensitive: true, sourceName: null });
    expect(JSON.stringify(detail)).not.toContain("Luna");
    expect(await revealSensitiveSource(who.userId, who.sensitiveId, ctx)).toEqual({
      ok: true,
      sourceName: "Luna Dating (fictional)",
    });
    const audit = await getAuthDb().collection("auditLogs").findOne({ event: "SENSITIVE_SOURCE_REVEALED" });
    expect(audit?.metadata).toEqual({ exposureId: who.sensitiveId });
  });
});

describe("checklist and remediation state", () => {
  it("persists ticks and moves open → in progress → remediated, lowering the score each time", async () => {
    const who = await scanned();
    const before = (await getRiskScores(who.userId)).current!.score;
    const items = (await getExposureDetail(who.userId, who.criticalId))!.checklist;

    expect(await setChecklistItem(who.userId, who.criticalId, items[0].key, true, ctx)).toEqual({
      ok: true,
      remediationState: "in_progress",
    });
    const midway = (await getRiskScores(who.userId)).current!.score;
    expect(midway).toBeLessThan(before);

    for (const item of items.slice(1))
      await setChecklistItem(who.userId, who.criticalId, item.key, true, ctx);
    const detail = await getExposureDetail(who.userId, who.criticalId);
    expect(detail?.remediationState).toBe("remediated");
    expect(detail?.checklist.every((i) => i.done)).toBe(true);
    const after = (await getRiskScores(who.userId)).current!.score;
    expect(after).toBeLessThan(midway);
    expect(await RiskScore.countDocuments({ userId: who.userId, reason: "remediation" })).toBe(items.length);
  });

  it("unticking moves a remediated exposure back to in progress", async () => {
    const who = await scanned();
    const items = (await getExposureDetail(who.userId, who.criticalId))!.checklist;
    for (const item of items) await setChecklistItem(who.userId, who.criticalId, item.key, true, ctx);
    expect(await setChecklistItem(who.userId, who.criticalId, items[0].key, false, ctx)).toEqual({
      ok: true,
      remediationState: "in_progress",
    });
  });

  it("ticking twice is idempotent", async () => {
    const who = await scanned();
    const key = (await getExposureDetail(who.userId, who.criticalId))!.checklist[0].key;
    await setChecklistItem(who.userId, who.criticalId, key, true, ctx);
    await setChecklistItem(who.userId, who.criticalId, key, true, ctx);
    expect(await RemediationAction.countDocuments({ exposureId: new Types.ObjectId(who.criticalId) })).toBe(
      1,
    );
  });

  it("rejects checklist items that don't belong to this exposure", async () => {
    const who = await scanned();
    for (const bad of ["not-a-key", "watch-financial-statements", '{"$ne":null}']) {
      expect(await setChecklistItem(who.userId, who.criticalId, bad, true, ctx)).toEqual({
        ok: false,
        reason: "invalid_item",
      });
    }
  });

  it("dismissing requires a known reason; reopening clears it", async () => {
    const who = await scanned();
    expect(await setRemediationState(who.userId, who.criticalId, "dismissed", ctx)).toEqual({
      ok: false,
      reason: "reason_required",
    });
    expect(await setRemediationState(who.userId, who.criticalId, "dismissed", ctx, "made-up")).toEqual({
      ok: false,
      reason: "reason_required",
    });
    expect(await setRemediationState(who.userId, who.criticalId, "dismissed", ctx, "not_my_account")).toEqual(
      {
        ok: true,
        remediationState: "dismissed",
      },
    );
    expect((await getExposureDetail(who.userId, who.criticalId))?.dismissReason).toBe("not_my_account");
    // A dismissed exposure stays dismissed when its checklist changes.
    const key = (await getExposureDetail(who.userId, who.criticalId))!.checklist[0].key;
    expect(await setChecklistItem(who.userId, who.criticalId, key, true, ctx)).toEqual({
      ok: true,
      remediationState: "dismissed",
    });
    expect(await setRemediationState(who.userId, who.criticalId, "open", ctx)).toEqual({
      ok: true,
      remediationState: "open",
    });
    expect((await getExposureDetail(who.userId, who.criticalId))?.dismissReason).toBeNull();
  });

  it("rejects invalid transitions", async () => {
    const who = await scanned();
    await setRemediationState(who.userId, who.criticalId, "dismissed", ctx, "other");
    expect(await setRemediationState(who.userId, who.criticalId, "remediated", ctx)).toEqual({
      ok: false,
      reason: "invalid_transition",
    });
  });

  it("a later scan never undoes the user's remediation", async () => {
    const who = await scanned();
    await setRemediationState(who.userId, who.criticalId, "remediated", ctx);
    configureScanProcessing({ providers: [createMockProvider("multiple", "mock-a")], policy: fast });
    await startManualScan(who.userId, who.identityId, ctx, new Date(Date.now() + 16 * 60_000));
    await getScanQueue().drain();
    expect((await getExposureDetail(who.userId, who.criticalId))?.remediationState).toBe("remediated");
  });

  it("removing the identity deletes its remediation progress too", async () => {
    const who = await scanned();
    const key = (await getExposureDetail(who.userId, who.criticalId))!.checklist[0].key;
    await setChecklistItem(who.userId, who.criticalId, key, true, ctx);
    await removeIdentity({ userId: who.userId }, who.identityId, { ip: "x", requestId: null });
    expect(await RemediationAction.countDocuments({ userId: who.userId })).toBe(0);
  });
});

describe("remediation IDOR matrix", () => {
  it("another user can't read, tick, change, or reveal someone else's exposure", async () => {
    const victim = await scanned("victim@example.com");
    const attacker = new Types.ObjectId().toHexString();
    const key = (await getExposureDetail(victim.userId, victim.criticalId))!.checklist[0].key;
    expect(await getExposureDetail(attacker, victim.criticalId)).toBeNull();
    expect(await setChecklistItem(attacker, victim.criticalId, key, true, ctx)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await setRemediationState(attacker, victim.criticalId, "remediated", ctx)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await revealSensitiveSource(attacker, victim.sensitiveId, ctx)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect((await getExposureDetail(victim.userId, victim.criticalId))?.remediationState).toBe("open");
    expect(await RemediationAction.countDocuments()).toBe(0);
    for (const bad of ["", "123", '{"$ne":null}', "0".repeat(24)]) {
      expect(await getExposureDetail(victim.userId, bad)).toBeNull();
    }
  });
});
