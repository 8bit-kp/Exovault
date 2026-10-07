import { Types } from "mongoose";
import { afterEach, describe, expect, it } from "vitest";
import { getAuthDb } from "@/lib/db/mongo-client";
import { Identity } from "@/models/Identity";
import { Notification } from "@/models/Notification";
import type { ExposureProvider, ProviderExposure } from "@/server/providers/exposure/interface";
import { createMockProvider } from "@/server/providers/exposure/mock";
import { MOCK_BREACHES } from "@/server/providers/exposure/mock/catalog";
import type { AlertDelivery } from "@/server/providers/notifications/interface";
import { DEFAULT_RETRY_POLICY } from "@/server/services/exposure/resilience";
import { addEmailIdentity } from "@/server/services/identity/identity-service";
import { enableMonitoring, runMonitoringTick } from "@/server/services/monitoring/monitoring-service";
import {
  createUnsubscribeToken,
  dispatchDueNotifications,
  getPreferences,
  listNotifications,
  setNotificationProvider,
  unsubscribeWithToken,
  updatePreferences,
} from "@/server/services/notification/notification-service";
import { configureScanProcessing, getScanQueue, startManualScan } from "@/server/services/scan/scan-service";
import { outbox, setupAuthHarness } from "./helpers/auth-harness";

setupAuthHarness();

const fast = { ...DEFAULT_RETRY_POLICY, attemptTimeoutMs: 150, baseDelayMs: 1, maxDelayMs: 2 };
const ctx = { requestId: "req-notify" };
const deliveries: AlertDelivery[] = [];

afterEach(() => {
  configureScanProcessing({});
  setNotificationProvider(undefined);
  deliveries.length = 0;
});

function capture(fail = false) {
  setNotificationProvider({
    channel: "email",
    send: async (delivery) => {
      if (fail) throw new Error("smtp down");
      deliveries.push(delivery);
    },
  });
}

function mutable(initial: ProviderExposure[]) {
  let current = initial;
  const provider: ExposureProvider & { set(next: ProviderExposure[]): void } = {
    getName: () => "mock-m",
    getCapabilities: () => ({ identifierTypes: ["email"], rateLimit: { requests: 1000, windowMs: 60_000 } }),
    search: async () => ({ status: "ok", exposures: current, checkedAt: new Date() }),
    set: (next) => {
      current = next;
    },
  };
  return provider;
}

/** A real account (alerts go to the account email) with a monitored, verified identity. */
async function monitoredAccount(email: string, providers: ExposureProvider[]) {
  configureScanProcessing({ providers, policy: fast });
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
    { ip: "203.0.113.80", requestId: null },
  );
  if (!added.ok) throw new Error("setup");
  await enableMonitoring(userId.toHexString(), added.identityId, "6h", ctx);
  return { userId: userId.toHexString(), identityId: added.identityId };
}

async function scheduledScan(identityId: string) {
  await Identity.updateOne(
    { _id: identityId },
    { $set: { "monitoring.nextScanAt": new Date(Date.now() - 1000) } },
  );
  await runMonitoringTick();
  await getScanQueue().drain();
}

describe("alerts from scheduled monitoring", () => {
  it("emails NEW exposures once, to the account email, with masked identity and app links", async () => {
    capture();
    const who = await monitoredAccount("alert.owner@example.com", [createMockProvider("multiple", "mock-a")]);
    await scheduledScan(who.identityId);

    const created = await Notification.find({ userId: who.userId }).lean();
    // multiple = critical, high, medium, low; default minimum severity is medium.
    expect(created.filter((n) => n.status === "pending")).toHaveLength(3);
    expect(created.filter((n) => n.suppressionReason === "below_min_severity")).toHaveLength(1);

    expect(await dispatchDueNotifications()).toEqual({ sent: 3, emails: 1 });
    expect(deliveries).toHaveLength(1);
    const [delivery] = deliveries;
    expect(delivery.to).toBe("alert.owner@example.com");
    expect(delivery.items.map((i) => i.identityMasked)).toEqual(Array(3).fill("a****r@example.com"));
    expect(delivery.items.every((i) => i.link.includes("/app/exposures/"))).toBe(true);
    // Sensitive source never named.
    expect(delivery.items.find((i) => i.severity === "medium")?.sourceName).toBeNull();

    // Nothing more to send; re-dispatch is a no-op.
    expect(await dispatchDueNotifications()).toEqual({ sent: 0, emails: 0 });
  });

  it("never alerts the same exposure twice across later scans", async () => {
    capture();
    const who = await monitoredAccount("repeat@example.com", [createMockProvider("single", "mock-a")]);
    await scheduledScan(who.identityId);
    await dispatchDueNotifications();
    await scheduledScan(who.identityId);
    await scheduledScan(who.identityId);
    await dispatchDueNotifications();
    expect(await Notification.countDocuments({ userId: who.userId })).toBe(1);
    expect(deliveries).toHaveLength(1);
  });

  it("alerts a material change (severity up) once, and ignores changes that don't raise severity", async () => {
    capture();
    const provider = mutable([MOCK_BREACHES.fabrikam]); // low
    const who = await monitoredAccount("change@example.com", [provider]);
    await updatePreferences(who.userId, { ...(await getPreferences(who.userId)), minSeverity: "low" }, ctx);
    await scheduledScan(who.identityId);

    provider.set([{ ...MOCK_BREACHES.fabrikam, exposedDataTypes: ["email", "name", "profile"] }]); // still low
    await scheduledScan(who.identityId);
    expect(await Notification.countDocuments({ kind: "exposure_changed" })).toBe(0);

    provider.set([{ ...MOCK_BREACHES.fabrikam, exposedDataTypes: ["email", "name", "password_plaintext"] }]); // critical
    await scheduledScan(who.identityId);
    await scheduledScan(who.identityId);
    expect(await Notification.countDocuments({ kind: "exposure_changed" })).toBe(1);
  });

  it("doesn't alert for manual scans: the user is already looking", async () => {
    capture();
    const who = await monitoredAccount("manual@example.com", [createMockProvider("multiple", "mock-a")]);
    await startManualScan(who.userId, who.identityId, ctx);
    await getScanQueue().drain();
    expect(await Notification.countDocuments()).toBe(0);
  });
});

describe("preferences, quiet hours and digests", () => {
  it("records but doesn't email when alerts are switched off, even after creation", async () => {
    capture();
    const who = await monitoredAccount("off@example.com", [createMockProvider("single", "mock-a")]);
    await scheduledScan(who.identityId);
    await updatePreferences(who.userId, { ...(await getPreferences(who.userId)), emailEnabled: false }, ctx);
    expect(await dispatchDueNotifications()).toEqual({ sent: 0, emails: 0 });
    expect((await Notification.findOne({ userId: who.userId }).lean())?.suppressionReason).toBe(
      "email_disabled",
    );
  });

  it("holds alerts during quiet hours and sends them when they end", async () => {
    capture();
    const who = await monitoredAccount("quiet@example.com", [createMockProvider("single", "mock-a")]);
    await updatePreferences(
      who.userId,
      { ...(await getPreferences(who.userId)), quietHours: { enabled: true, start: "00:00", end: "23:59" } },
      ctx,
    );
    await scheduledScan(who.identityId);
    const pending = await Notification.findOne({ userId: who.userId }).lean();
    expect(pending?.scheduledFor.getTime()).toBeGreaterThan(Date.now());
    expect(await dispatchDueNotifications()).toEqual({ sent: 0, emails: 0 });
    expect(await dispatchDueNotifications(new Date(pending!.scheduledFor.getTime() + 1000))).toEqual({
      sent: 1,
      emails: 1,
    });
  });

  it("digest mode collects alerts into one email at the digest time", async () => {
    capture();
    const who = await monitoredAccount("digest@example.com", [createMockProvider("multiple", "mock-a")]);
    await updatePreferences(
      who.userId,
      { ...(await getPreferences(who.userId)), mode: "digest", minSeverity: "low" },
      ctx,
    );
    await scheduledScan(who.identityId);
    const rows = await Notification.find({ userId: who.userId }).lean();
    expect(rows.every((r) => r.digest)).toBe(true);
    const at = new Date(Math.max(...rows.map((r) => r.scheduledFor.getTime())) + 1000);
    expect(await dispatchDueNotifications(at)).toEqual({ sent: 4, emails: 1 });
    expect(deliveries[0].digest).toBe(true);
  });

  it("validates preferences strictly", async () => {
    const userId = new Types.ObjectId().toHexString();
    const bad = await updatePreferences(
      userId,
      {
        emailEnabled: true,
        minSeverity: "urgent",
        mode: "hourly",
        quietHours: { enabled: true, start: "25:00", end: "07:00" },
        timezone: "Mars/Base",
      },
      ctx,
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok)
      expect(Object.keys(bad.errors).sort()).toEqual(["minSeverity", "mode", "quietHours.start", "timezone"]);
  });
});

describe("delivery guarantees", () => {
  it("concurrent dispatchers send each alert exactly once", async () => {
    capture();
    const who = await monitoredAccount("race@example.com", [createMockProvider("multiple", "mock-a")]);
    await scheduledScan(who.identityId);
    const results = await Promise.all([
      dispatchDueNotifications(),
      dispatchDueNotifications(),
      dispatchDueNotifications(),
    ]);
    expect(results.reduce((sum, r) => sum + r.sent, 0)).toBe(3);
    expect(deliveries.flatMap((d) => d.items)).toHaveLength(3);
  });

  it("retries a failed send with backoff, then gives up after 3 attempts", async () => {
    capture(true);
    const who = await monitoredAccount("retry@example.com", [createMockProvider("single", "mock-a")]);
    await scheduledScan(who.identityId);
    let at = new Date();
    for (let i = 0; i < 3; i++) {
      await dispatchDueNotifications(at);
      at = new Date(at.getTime() + 60 * 60_000);
    }
    expect(await Notification.findOne({ userId: who.userId }).lean()).toMatchObject({
      status: "failed",
      attempts: 3,
    });
  });

  it("renders the real email: no identifier or source in the subject, one-click unsubscribe headers", async () => {
    const who = await monitoredAccount("render.check@example.com", [createMockProvider("single", "mock-a")]);
    await scheduledScan(who.identityId);
    await dispatchDueNotifications();
    const message = outbox.outbox.find((m) => m.kind === "exposure-alert");
    expect(message?.to).toBe("render.check@example.com");
    expect(message?.subject).not.toMatch(/render|example\.com|Contoso/i);
    expect(message?.text).toContain("r****k@example.com");
    expect(message?.text).not.toContain("render.check@");
    expect(message?.headers?.["List-Unsubscribe"]).toMatch(
      /^<http.*\/api\/notifications\/unsubscribe\?token=.+>$/,
    );
    expect(message?.text).toMatch(/\/notifications\/unsubscribe\?token=/);
    expect(message?.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});

describe("unsubscribe and inbox", () => {
  it("a valid token turns email alerts off; a forged or other-purpose token does nothing", async () => {
    const userId = new Types.ObjectId().toHexString();
    expect(await unsubscribeWithToken("forged.token.value.x")).toBe(false);
    expect(await unsubscribeWithToken(undefined)).toBe(false);
    expect(await unsubscribeWithToken(createUnsubscribeToken(userId))).toBe(true);
    expect((await getPreferences(userId)).emailEnabled).toBe(false);
  });

  it("the inbox is per user, hides sensitive names, and never shows another user's alerts", async () => {
    capture();
    const who = await monitoredAccount("inbox@example.com", [createMockProvider("multiple", "mock-a")]);
    await scheduledScan(who.identityId);
    const mine = await listNotifications(who.userId);
    expect(mine).toHaveLength(4);
    expect(JSON.stringify(mine)).not.toContain("Luna");
    expect(await listNotifications(new Types.ObjectId().toHexString())).toEqual([]);
  });

  it("keeps notifications 90 days (TTL)", async () => {
    const ttl = (await Notification.collection.indexes()).find((i) => i.expireAfterSeconds !== undefined);
    expect(ttl?.expireAfterSeconds).toBe(90 * 24 * 60 * 60);
  });
});
