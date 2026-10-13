// Demo mode is read from the environment once per test file (getEnv is lazy and cached per module graph).
process.env.DEMO_MODE = "on";
process.env.DEMO_ACCOUNT_EMAIL = "viewer@exovault.example";
process.env.DEMO_ACCOUNT_PASSWORD = "shared demo password 2026";

import { afterEach, describe, expect, it } from "vitest";
import { demoGuard, isDemoMode, primaryCta } from "@/config/demo";
import { getAuthDb } from "@/lib/db/mongo-client";
import { Exposure } from "@/models/Exposure";
import { Identity } from "@/models/Identity";
import { RemediationAction } from "@/models/RemediationAction";
import { getEmailProvider, setEmailProvider } from "@/server/providers/email";
import { signIn } from "@/server/services/account/auth-service";
import { provisionDemoAccount, resetDemoAccountIfEnabled } from "@/server/services/demo/demo-account";
import { DEFAULT_RETRY_POLICY } from "@/server/services/exposure/resilience";
import { configureScanProcessing } from "@/server/services/scan/scan-service";
import { ctx, outbox, setupAuthHarness } from "./helpers/auth-harness";

setupAuthHarness();

const EMAIL = "viewer@exovault.example";
const PASSWORD = "shared demo password 2026";

afterEach(() => {
  configureScanProcessing({});
  setEmailProvider(outbox);
});

describe("demo mode (D-041)", () => {
  it("provisions a verified account with a verified identity and fictional findings", async () => {
    configureScanProcessing({ policy: { ...DEFAULT_RETRY_POLICY, baseDelayMs: 1, maxDelayMs: 2 } });
    expect(await resetDemoAccountIfEnabled()).toBe(true);
    const user = await getAuthDb().collection("user").findOne({ email: EMAIL });
    expect(user?.emailVerified).toBe(true);
    const userId = String(user!._id);
    expect(await Identity.countDocuments({ userId, verificationStatus: "verified" })).toBe(1);
    expect(await Exposure.countDocuments({ userId, isDemo: true })).toBeGreaterThan(0);
    expect(await Exposure.countDocuments({ userId, remediationState: "remediated" })).toBe(1);
    // A password sign-in goes straight in: no code, because the account is already verified.
    expect(await signIn({ email: EMAIL, password: PASSWORD }, ctx())).toEqual({ ok: true });
  });

  it("the daily reset undoes what visitors changed", async () => {
    configureScanProcessing({ policy: { ...DEFAULT_RETRY_POLICY, baseDelayMs: 1, maxDelayMs: 2 } });
    await resetDemoAccountIfEnabled();
    const userId = String((await getAuthDb().collection("user").findOne({ email: EMAIL }))!._id);
    const before = await Exposure.find({ userId }, { sourceName: 1, remediationState: 1, _id: 0 })
      .sort({ sourceName: 1 })
      .lean();

    // A visitor dismisses everything, ticks steps and turns monitoring on.
    await Exposure.updateMany({ userId }, { $set: { remediationState: "dismissed" } });
    const one = await Exposure.findOne({ userId }).lean();
    await RemediationAction.create({
      userId,
      identityId: one!.identityId,
      exposureId: one!._id,
      actionKey: "change-password",
      completedAt: new Date(),
    });
    await Identity.updateMany({ userId }, { $set: { "monitoring.enabled": true } });
    expect(await RemediationAction.countDocuments({ userId })).toBe(1);

    expect(await resetDemoAccountIfEnabled()).toBe(true);
    const after = await Exposure.find({ userId }, { sourceName: 1, remediationState: 1, _id: 0 })
      .sort({ sourceName: 1 })
      .lean();
    expect(after).toEqual(before);
    expect(await RemediationAction.countDocuments({ userId })).toBe(0);
    expect(await Identity.countDocuments({ userId, "monitoring.enabled": true })).toBe(0);
  });

  it("lets many viewers sign in to the shared account without locking it, while other accounts keep the limit", async () => {
    await provisionDemoAccount(EMAIL, PASSWORD);
    // Eight viewers on different networks, then twelve on one shared office network.
    const viewers = [];
    for (let i = 0; i < 8; i++) viewers.push(await signIn({ email: EMAIL, password: PASSWORD }, ctx()));
    for (let i = 0; i < 12; i++) {
      viewers.push(await signIn({ email: EMAIL, password: PASSWORD }, ctx({ ip: "203.0.113.200" })));
    }
    expect(viewers.every((r) => r.ok)).toBe(true);

    const other = [];
    for (let i = 0; i < 6; i++)
      other.push(await signIn({ email: "someone@example.com", password: "guess guess guess" }, ctx()));
    expect(other[5]).toMatchObject({ ok: false, reason: "rate_limited" });
  });

  it("provisioning sets the stored password to the one given", async () => {
    await provisionDemoAccount(EMAIL, "an older demo password");
    expect((await signIn({ email: EMAIL, password: "an older demo password" }, ctx())).ok).toBe(true);
    await provisionDemoAccount(EMAIL, PASSWORD);
    expect((await signIn({ email: EMAIL, password: "an older demo password" }, ctx())).ok).toBe(false);
    expect((await signIn({ email: EMAIL, password: PASSWORD }, ctx())).ok).toBe(true);
  });

  it("sends no email, refuses account-changing actions and points visitors at the demo", () => {
    setEmailProvider(undefined);
    expect(getEmailProvider().name).toBe("demo-discard");
    expect(isDemoMode()).toBe(true);
    expect(demoGuard()).toMatchObject({ status: "error" });
    expect(primaryCta()).toEqual({ href: "/auth/sign-in", label: "Try the demo" });
  });

  it("creates the demo account on the first sign-in with the configured credentials (no seed needed)", async () => {
    configureScanProcessing({ policy: { ...DEFAULT_RETRY_POLICY, baseDelayMs: 1, maxDelayMs: 2 } });
    expect(await getAuthDb().collection("user").countDocuments({ email: EMAIL })).toBe(0);
    expect(await signIn({ email: EMAIL, password: PASSWORD }, ctx())).toEqual({ ok: true });
    const userId = String((await getAuthDb().collection("user").findOne({ email: EMAIL }))!._id);
    expect(await Exposure.countDocuments({ userId, isDemo: true })).toBeGreaterThan(0);
  });

  it("repairs a demo password that drifted from DEMO_ACCOUNT_PASSWORD", async () => {
    await provisionDemoAccount(EMAIL, "an older demo password");
    expect(await signIn({ email: EMAIL, password: PASSWORD }, ctx())).toEqual({ ok: true });
  });

  it("never creates or changes anything for other credentials", async () => {
    expect(await signIn({ email: EMAIL, password: "not the demo password" }, ctx())).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(await getAuthDb().collection("user").countDocuments({ email: EMAIL })).toBe(0);
    expect(await signIn({ email: "other@exovault.example", password: PASSWORD }, ctx())).toMatchObject({
      ok: false,
      reason: "invalid",
    });
    expect(await getAuthDb().collection("user").countDocuments()).toBe(0);
  });
});
