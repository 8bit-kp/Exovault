import { Types } from "mongoose";
import { afterEach, describe, expect, it } from "vitest";
import { Exposure } from "@/models/Exposure";
import { createMockProvider } from "@/server/providers/exposure/mock";
import { DEFAULT_RETRY_POLICY } from "@/server/services/exposure/resilience";
import {
  addEmailIdentity,
  removeIdentity,
  resendIdentityCode,
  revealIdentity,
} from "@/server/services/identity/identity-service";
import {
  createUnsubscribeToken,
  unsubscribeWithToken,
} from "@/server/services/notification/notification-service";
import { getExposureDetail } from "@/server/services/remediation/remediation-service";
import { configureScanProcessing, getScanQueue, startManualScan } from "@/server/services/scan/scan-service";
import { outbox, setupAuthHarness } from "../integration/helpers/auth-harness";

/** D-035: limits keyed by the *target*, and leaks closed in Phase 11. */
setupAuthHarness();
afterEach(() => configureScanProcessing({}));

const ip = { ip: "203.0.113.99", requestId: null };
const actor = (email: string) => ({
  userId: new Types.ObjectId().toHexString(),
  accountEmail: email,
  accountEmailVerified: true,
});

describe("abuse limits keyed by the target address", () => {
  it("many accounts can't flood one inbox with ownership codes", async () => {
    const target = "someone.else@example.org";
    let sent = 0;
    for (let i = 0; i < 4; i++) {
      const a = actor(`attacker${i}@example.com`);
      const added = await addEmailIdentity(a, target, ip);
      if (!added.ok) continue;
      for (let r = 0; r < 3; r++) await resendIdentityCode(a, added.identityId, ip);
      await removeIdentity(a, added.identityId, ip);
    }
    sent = outbox.outbox.filter((m) => m.kind === "identity-verification" && m.to === target).length;
    expect(sent).toBeLessThanOrEqual(5);
  });

  it("reveal is capped per user", async () => {
    const a = actor("reveal@example.com");
    const added = await addEmailIdentity(a, a.accountEmail, ip);
    if (!added.ok) throw new Error();
    const results = [];
    for (let i = 0; i < 31; i++) results.push(await revealIdentity(a, added.identityId, ip));
    expect(results.slice(0, 30).every((r) => r.ok)).toBe(true);
    expect(results[30]).toMatchObject({ ok: false });
  });

  it("unsubscribe is limited per client IP", async () => {
    const token = createUnsubscribeToken(new Types.ObjectId().toHexString());
    const results = [];
    for (let i = 0; i < 21; i++) results.push(await unsubscribeWithToken(token, "198.51.100.7"));
    expect(results.slice(0, 20).every(Boolean)).toBe(true);
    expect(results[20]).toBe(false);
  });
});

describe("sensitive sources (spec 2.3)", () => {
  it("detail and list view models carry no sensitive name, including via evidence links", async () => {
    configureScanProcessing({
      providers: [createMockProvider("multiple", "mock-a")],
      policy: { ...DEFAULT_RETRY_POLICY, attemptTimeoutMs: 150, baseDelayMs: 1, maxDelayMs: 2 },
    });
    const a = actor("sens@example.com");
    const added = await addEmailIdentity(a, a.accountEmail, ip);
    if (!added.ok) throw new Error();
    await startManualScan(a.userId, added.identityId, { requestId: null });
    await getScanQueue().drain();
    const sensitive = await Exposure.findOne({ userId: a.userId, isSensitiveSource: true });
    await Exposure.updateOne(
      { _id: sensitive!._id },
      { $set: { evidenceReferences: ["https://haveibeenpwned.com/Breach/LunaDating"] } },
    );
    const detail = await getExposureDetail(a.userId, String(sensitive!._id));
    expect(JSON.stringify(detail)).not.toMatch(/Luna/);
    const { listExposuresForUser } = await import("@/server/services/exposure/exposure-query");
    expect(JSON.stringify(await listExposuresForUser(a.userId))).not.toMatch(/Luna/);
  });
});
