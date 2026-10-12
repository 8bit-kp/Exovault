import { Types } from "mongoose";
import { afterEach, describe, expect, it } from "vitest";
import { getAuth } from "@/lib/auth/server";
import { getAuthDb } from "@/lib/db/mongo-client";
import { AccountDeletion } from "@/models/AccountDeletion";
import { Identity } from "@/models/Identity";
import { Scan } from "@/models/Scan";
import { createMockProvider } from "@/server/providers/exposure/mock";
import type { AlertDelivery } from "@/server/providers/notifications/interface";
import { requestAccountDeletion } from "@/server/services/account/account-deletion-service";
import { DEFAULT_RETRY_POLICY } from "@/server/services/exposure/resilience";
import { addEmailIdentity } from "@/server/services/identity/identity-service";
import { enableMonitoring } from "@/server/services/monitoring/monitoring-service";
import { setNotificationProvider } from "@/server/services/notification/notification-service";
import { configureScanProcessing } from "@/server/services/scan/scan-service";
import { runScheduledJobs } from "@/server/services/scheduler/scheduled-jobs";
import { setupAuthHarness } from "./helpers/auth-harness";

setupAuthHarness();

const HOUR = 3_600_000;
const ctx = { requestId: "req-cron" };
const deliveries: AlertDelivery[] = [];

afterEach(() => {
  configureScanProcessing({});
  setNotificationProvider(undefined);
  deliveries.length = 0;
});

async function monitored(email: string, nextScanInMs: number) {
  const userId = new Types.ObjectId();
  await getAuthDb().collection("user").insertOne({
    _id: userId,
    email,
    emailVerified: true,
    name: "",
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const added = await addEmailIdentity(
    { userId: userId.toHexString(), accountEmail: email, accountEmailVerified: true },
    email,
    { ip: "203.0.113.70", requestId: null },
  );
  if (!added.ok) throw new Error("setup");
  await enableMonitoring(userId.toHexString(), added.identityId, "24h", ctx);
  await Identity.updateOne(
    { _id: new Types.ObjectId(added.identityId) },
    { $set: { "monitoring.nextScanAt": new Date(Date.now() + nextScanInMs) } },
  );
  return { userId: userId.toHexString(), identityId: added.identityId };
}

describe("cron-driven scheduled jobs (D-039)", () => {
  it("scans what is due within half an interval, and alerts on it in the same run", async () => {
    configureScanProcessing({
      providers: [createMockProvider("multiple", "mock-a")],
      policy: { ...DEFAULT_RETRY_POLICY, attemptTimeoutMs: 150, baseDelayMs: 1, maxDelayMs: 2 },
    });
    setNotificationProvider({ channel: "email", send: async (d) => void deliveries.push(d) });
    const soon = await monitored("due.soon@example.com", 6 * HOUR); // inside a daily cron's 12 h window
    const later = await monitored("due.later@example.com", 20 * HOUR); // next run's job

    const summary = await runScheduledJobs(1440);

    expect(summary).toMatchObject({ claimed: 1, started: 1, emails: 1 });
    expect(summary.alertsSent).toBeGreaterThan(0);
    expect(deliveries.map((d) => d.to)).toEqual(["due.soon@example.com"]);
    expect(await Scan.countDocuments({ identityId: soon.identityId, state: "completed" })).toBe(1);
    expect(await Scan.countDocuments({ identityId: later.identityId })).toBe(0);
    // The next check moved about a day ahead, so the next daily run won't repeat it.
    const next = (await Identity.findById(soon.identityId).lean())?.monitoring?.nextScanAt;
    expect(next!.getTime() - Date.now()).toBeGreaterThan(20 * HOUR);
  });

  it("purges accounts whose grace period has ended", async () => {
    const email = "cron.purge@example.com";
    const password = "a long enough password";
    await getAuth().api.signUpEmail({ body: { email, password, name: "" } });
    const user = (await getAuthDb().collection("user").findOne({ email }))!;
    const userId = user._id.toHexString();
    expect((await requestAccountDeletion({ id: userId, email }, password, ctx)).ok).toBe(true);
    await AccountDeletion.updateOne({ userId }, { $set: { purgeAfter: new Date(Date.now() - 1000) } });

    expect((await runScheduledJobs(1440)).purged).toBe(1);
    expect(await getAuthDb().collection("user").countDocuments({ email })).toBe(0);
  });

  it("only offers and accepts frequencies the cron can honour", async () => {
    const who = await monitored("freq@example.com", 0);
    expect(await enableMonitoring(who.userId, who.identityId, "6h", ctx, new Date(), ["24h"])).toEqual({
      ok: false,
      reason: "invalid_frequency",
    });
    expect((await enableMonitoring(who.userId, who.identityId, "24h", ctx, new Date(), ["24h"])).ok).toBe(
      true,
    );
  });
});
