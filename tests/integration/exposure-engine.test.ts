import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { getAuthDb } from "@/lib/db/mongo-client";
import { Breach } from "@/models/Breach";
import { Exposure } from "@/models/Exposure";
import { ProviderState } from "@/models/ProviderState";
import type { ExposureProvider, ProviderExposure } from "@/server/providers/exposure/interface";
import { createMockProvider } from "@/server/providers/exposure/mock";
import { MOCK_BREACHES } from "@/server/providers/exposure/mock/catalog";
import { checkIdentityExposures } from "@/server/services/exposure/exposure-service";
import { DEFAULT_RETRY_POLICY } from "@/server/services/exposure/resilience";
import { addEmailIdentity, removeIdentity } from "@/server/services/identity/identity-service";
import { setupAuthHarness } from "./helpers/auth-harness";

setupAuthHarness();

const fast = { ...DEFAULT_RETRY_POLICY, attemptTimeoutMs: 150, baseDelayMs: 1, maxDelayMs: 2 };
const ctx = { ip: "203.0.113.30", requestId: "req-engine" };

async function verifiedIdentity(email = "owner@example.com") {
  const userId = new Types.ObjectId().toHexString();
  const added = await addEmailIdentity(
    { userId, accountEmail: email, accountEmailVerified: true },
    email,
    ctx,
  );
  if (!added.ok) throw new Error("setup");
  return { userId, identityId: added.identityId };
}

/** A provider whose answer can change between scans. */
function mutable(name: string, initial: ProviderExposure[]) {
  let current = initial;
  const provider: ExposureProvider & { set(next: ProviderExposure[]): void } = {
    getName: () => name,
    getCapabilities: () => ({ identifierTypes: ["email"], rateLimit: { requests: 1000, windowMs: 60_000 } }),
    search: async () => ({ status: "ok", exposures: current, checkedAt: new Date() }),
    set: (next) => {
      current = next;
    },
  };
  return provider;
}

const run = (who: { userId: string; identityId: string }, providers: ExposureProvider[]) =>
  checkIdentityExposures({ ...who, providers, policy: fast });

describe("exposure engine: end to end against MongoDB", () => {
  it("clean: completed, nothing stored", async () => {
    const who = await verifiedIdentity();
    const result = await run(who, [createMockProvider("clean")]);
    expect(result).toMatchObject({ ok: true, result: { outcome: "completed", diff: { new: [] } } });
    expect(await Exposure.countDocuments()).toBe(0);
  });

  it("multiple: stores one exposure per incident with OUR severity, never the provider's", async () => {
    const who = await verifiedIdentity();
    const result = await run(who, [createMockProvider("multiple")]);
    if (!result.ok) throw new Error();
    expect(result.result.diff.new).toHaveLength(4);
    const northwind = await Exposure.findOne({ sourceKey: "northwindrewardsfictional" }).lean();
    expect(northwind).toMatchObject({
      severity: "critical",
      detectionState: "new",
      remediationState: "open",
    });
    const luna = await Exposure.findOne({ sourceKey: "lunadatingfictional" }).lean();
    expect(luna?.isSensitiveSource).toBe(true);
  });

  it("stores no identifier: exposures and catalog reference the identity by ID only", async () => {
    const who = await verifiedIdentity("very.private@example.com");
    await run(who, [createMockProvider("multiple")]);
    const dump = JSON.stringify([
      await getAuthDb().collection("exposures").find({}).toArray(),
      await getAuthDb().collection("breaches").find({}).toArray(),
      await getAuthDb().collection("providerStates").find({}).toArray(),
    ]);
    expect(dump).not.toContain("very.private");
  });

  it("is idempotent: re-running the same scan creates nothing new", async () => {
    const who = await verifiedIdentity();
    await run(who, [createMockProvider("multiple")]);
    const second = await run(who, [createMockProvider("multiple")]);
    if (!second.ok) throw new Error();
    expect(second.result.diff).toMatchObject({ new: [], changed: [] });
    expect(second.result.diff.existing).toHaveLength(4);
    expect(await Exposure.countDocuments()).toBe(4);
  });

  it("concurrent identical scans don't duplicate exposures (unique fingerprint)", async () => {
    const who = await verifiedIdentity();
    await Promise.all([
      run(who, [createMockProvider("multiple")]),
      run(who, [createMockProvider("multiple")]),
    ]);
    expect(await Exposure.countDocuments()).toBe(4);
  });

  it("duplicates within one response and across providers merge into one exposure", async () => {
    const who = await verifiedIdentity();
    const result = await run(who, [
      createMockProvider("duplicate", "mock-a"),
      createMockProvider("single", "mock-b"),
    ]);
    if (!result.ok) throw new Error();
    expect(result.result.diff.new).toHaveLength(1);
    const contoso = await Exposure.findOne().lean();
    expect(contoso?.providers).toEqual(["mock-a", "mock-b"]);
    expect(contoso?.exposedDataTypes).toEqual(["email", "ip_address", "password_hash", "username"]);
  });

  it("partial failure: keeps the working source's findings and reports PARTIAL", async () => {
    const who = await verifiedIdentity();
    const result = await run(who, [createMockProvider("single"), createMockProvider("failing")]);
    if (!result.ok) throw new Error();
    expect(result.result.outcome).toBe("partial");
    expect(result.result.providerResults.map((r) => [r.provider, r.state, r.errorCategory])).toEqual([
      ["mock-single", "ok", undefined],
      ["mock-failing", "error", "unavailable"],
    ]);
    expect(result.result.providerResults[1].attempts).toBe(3); // bounded retry
    expect(await Exposure.countDocuments()).toBe(1);
  });

  it("total failure: FAILED and existing results are left untouched", async () => {
    const who = await verifiedIdentity();
    await run(who, [createMockProvider("single")]);
    const result = await run(who, [createMockProvider("failing")]);
    if (!result.ok) throw new Error();
    expect(result.result.outcome).toBe("failed");
    expect(await Exposure.findOne().lean()).toMatchObject({ detectionState: "new" });
  });

  it("times out a slow provider instead of hanging the scan", async () => {
    const who = await verifiedIdentity();
    const started = Date.now();
    const result = await run(who, [createMockProvider("slow-timeout"), createMockProvider("single")]);
    if (!result.ok) throw new Error();
    expect(result.result.providerResults[0]).toMatchObject({ state: "error", errorCategory: "timeout" });
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("CHANGED when a provider adds data categories to a known breach", async () => {
    const who = await verifiedIdentity();
    const provider = mutable("mock-m", [MOCK_BREACHES.fabrikam]);
    await run(who, [provider]);
    provider.set([{ ...MOCK_BREACHES.fabrikam, exposedDataTypes: ["email", "name", "phone"] }]);
    const result = await run(who, [provider]);
    if (!result.ok) throw new Error();
    expect(result.result.diff.changed).toHaveLength(1);
    expect(await Exposure.findOne().lean()).toMatchObject({ detectionState: "changed", severity: "medium" });
  });

  it("NO_LONGER_REPORTED only when the reporting provider answered and omitted it", async () => {
    const who = await verifiedIdentity();
    const provider = mutable("mock-m", [MOCK_BREACHES.fabrikam]);
    await run(who, [provider]);

    // The reporting provider fails: proves nothing, state unchanged.
    await run(who, [createMockProvider("failing", "mock-m")]);
    expect((await Exposure.findOne().lean())?.detectionState).toBe("new");

    provider.set([]);
    const result = await run(who, [provider]);
    if (!result.ok) throw new Error();
    expect(result.result.diff.noLongerReported).toHaveLength(1);
    expect((await Exposure.findOne().lean())?.detectionState).toBe("no_longer_reported");
  });

  it("keeps the user's remediation progress when a scan updates an exposure", async () => {
    const who = await verifiedIdentity();
    await run(who, [createMockProvider("single")]);
    await getAuthDb()
      .collection("exposures")
      .updateMany({}, { $set: { remediationState: "in_progress" } });
    await run(who, [createMockProvider("duplicate")]);
    expect((await Exposure.findOne().lean())?.remediationState).toBe("in_progress");
  });

  it("shares one breach catalog entry across users", async () => {
    const a = await verifiedIdentity("a@example.com");
    const b = await verifiedIdentity("b@example.com");
    await run(a, [createMockProvider("single")]);
    await run(b, [createMockProvider("single")]);
    expect(await Breach.countDocuments()).toBe(1);
    expect(await Exposure.countDocuments()).toBe(2);
  });

  it("refuses unverified, missing and other users' identities", async () => {
    const owner = new Types.ObjectId().toHexString();
    const pending = await addEmailIdentity(
      { userId: owner, accountEmail: "me@example.com", accountEmailVerified: true },
      "other@example.org",
      ctx,
    );
    if (!pending.ok) throw new Error();
    const provider = createMockProvider("multiple");
    expect(
      await checkIdentityExposures({ userId: owner, identityId: pending.identityId, providers: [provider] }),
    ).toEqual({
      ok: false,
      reason: "not_verified",
    });
    const who = await verifiedIdentity();
    expect(
      await checkIdentityExposures({ userId: owner, identityId: who.identityId, providers: [provider] }),
    ).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(
      await checkIdentityExposures({ userId: owner, identityId: "0".repeat(24), providers: [provider] }),
    ).toEqual({ ok: false, reason: "not_found" });
    expect(await Exposure.countDocuments()).toBe(0);
  });

  it("opens the circuit after 3 consecutive failures and skips the provider during cooldown", async () => {
    const who = await verifiedIdentity();
    for (let i = 0; i < 3; i++) await run(who, [createMockProvider("failing", "mock-flaky")]);
    expect(await ProviderState.findOne({ provider: "mock-flaky" }).lean()).toMatchObject({ health: "down" });
    const result = await run(who, [createMockProvider("single", "mock-flaky")]);
    if (!result.ok) throw new Error();
    expect(result.result.providerResults[0]).toMatchObject({
      state: "skipped",
      errorCategory: "circuit_open",
      attempts: 0,
    });
    expect(result.result.outcome).toBe("failed");
  });

  it("closes the circuit again after a successful call", async () => {
    const who = await verifiedIdentity();
    await run(who, [createMockProvider("failing", "mock-x")]);
    await run(who, [createMockProvider("single", "mock-x")]);
    expect(await ProviderState.findOne({ provider: "mock-x" }).lean()).toMatchObject({
      health: "healthy",
      consecutiveFailures: 0,
    });
  });

  it("respects the provider's shared rate budget across scans", async () => {
    const who = await verifiedIdentity();
    const tiny: ExposureProvider = {
      ...createMockProvider("clean", "mock-tiny"),
      getCapabilities: () => ({ identifierTypes: ["email"], rateLimit: { requests: 2, windowMs: 60_000 } }),
    };
    await run(who, [tiny]);
    await run(who, [tiny]);
    const third = await run(who, [tiny]);
    if (!third.ok) throw new Error();
    expect(third.result.providerResults[0]).toMatchObject({
      state: "error",
      errorCategory: "budget_exhausted",
    });
  });

  it("removing the identity deletes its exposures (spec 5.2)", async () => {
    const who = await verifiedIdentity();
    await run(who, [createMockProvider("multiple")]);
    const other = await verifiedIdentity("other.user@example.com");
    await run(other, [createMockProvider("single")]);
    expect(await removeIdentity({ userId: who.userId }, who.identityId, ctx)).toEqual({ ok: true });
    expect(await Exposure.countDocuments({ identityId: who.identityId })).toBe(0);
    expect(await Exposure.countDocuments({ identityId: other.identityId })).toBe(1);
  });

  it("audits new exposures by count and identity ID only", async () => {
    const who = await verifiedIdentity();
    await run(who, [createMockProvider("multiple")]);
    const event = await getAuthDb().collection("auditLogs").findOne({ event: "EXPOSURE_DETECTED" });
    expect(event?.metadata).toEqual({ identityId: who.identityId, newCount: 4, changedCount: 0 });
  });
});
