import { Types } from "mongoose";
import { afterEach, describe, expect, it } from "vitest";
import { getAuth } from "@/lib/auth/server";
import { getAuthDb } from "@/lib/db/mongo-client";
import { AccountDeletion } from "@/models/AccountDeletion";
import { AuditLog } from "@/models/AuditLog";
import { Identity } from "@/models/Identity";
import { Notification } from "@/models/Notification";
import { setEmailProvider } from "@/server/providers/email";
import { createMockProvider } from "@/server/providers/exposure/mock";
import { DEFAULT_RETRY_POLICY } from "@/server/services/exposure/resilience";
import {
  cancelAccountDeletion,
  getPendingDeletion,
  purgeDueAccounts,
  requestAccountDeletion,
} from "@/server/services/account/account-deletion-service";
import { buildAccountExport, exportAccountData } from "@/server/services/account/data-export-service";
import { signIn } from "@/server/services/account/auth-service";
import { addEmailIdentity } from "@/server/services/identity/identity-service";
import { enableMonitoring } from "@/server/services/monitoring/monitoring-service";
import { configureScanProcessing, getScanQueue, startManualScan } from "@/server/services/scan/scan-service";
import { ctx as requestCtx, outbox, setupAuthHarness } from "./helpers/auth-harness";

setupAuthHarness();

const PASSWORD = "a long enough password";
const DAY = 24 * 60 * 60_000;
const ctx = { requestId: "req-privacy" };

afterEach(() => {
  configureScanProcessing({});
  setEmailProvider(outbox);
});

/** A real password account with a verified, monitored identity, a finished scan and a pending alert. */
async function populatedAccount(email: string) {
  configureScanProcessing({
    providers: [createMockProvider("multiple", "mock-a")],
    policy: { ...DEFAULT_RETRY_POLICY, attemptTimeoutMs: 150, baseDelayMs: 1, maxDelayMs: 2 },
  });
  await getAuth().api.signUpEmail({ body: { email, password: PASSWORD, name: "" } });
  await getAuthDb()
    .collection("user")
    .updateOne({ email }, { $set: { emailVerified: true } });
  const record = (await getAuthDb().collection("user").findOne({ email }))!;
  const user = { id: record._id.toHexString(), email, createdAt: record.createdAt as Date };
  expect((await signIn({ email, password: PASSWORD }, requestCtx())).ok).toBe(true);

  const added = await addEmailIdentity(
    { userId: user.id, accountEmail: email, accountEmailVerified: true },
    email,
    { ip: "203.0.113.90", requestId: null },
  );
  if (!added.ok) throw new Error("setup");
  const scan = await startManualScan(user.id, added.identityId, ctx);
  expect(scan.ok).toBe(true);
  await getScanQueue().drain();
  await enableMonitoring(user.id, added.identityId, "6h", ctx);
  await Notification.create({
    userId: user.id,
    identityId: new Types.ObjectId(added.identityId),
    exposureId: new Types.ObjectId(),
    channel: "email",
    kind: "new_exposure",
    severity: "high",
    dedupeKey: `test:${user.id}`,
    status: "pending",
    scheduledFor: new Date(),
  });
  return { user, identityId: added.identityId };
}

/** Every document in the database, as one string (for "is this value anywhere?" checks). */
async function wholeDatabase(): Promise<string> {
  const db = getAuthDb();
  const parts: string[] = [];
  for (const { name } of await db.listCollections().toArray()) {
    parts.push(JSON.stringify(await db.collection(name).find({}).toArray()));
  }
  return parts.join("\n");
}

describe("data export (spec 5.2)", () => {
  it("contains the user's data in clear and none of our internals", async () => {
    const { user } = await populatedAccount("export.owner@example.com");
    const other = await populatedAccount("someone.else@example.com");

    const data = await buildAccountExport(user);
    expect(data.format).toBe("exovault-export/1");
    expect(data.account.email).toBe(user.email);
    expect(data.identities).toHaveLength(1);
    expect(data.identities[0].value).toBe(user.email); // decrypted for its owner
    expect(data.identities[0].monitoring.enabled).toBe(true);
    expect(data.exposures.length).toBeGreaterThan(0);
    expect(data.scans).toHaveLength(1);
    expect(data.riskScores.length).toBeGreaterThan(0);
    expect(data.notifications).toHaveLength(1);
    expect(data.securityLog.some((e) => e.event === "IDENTITY_ADDED")).toBe(true);

    const text = JSON.stringify(data);
    for (const internal of [
      "valueEncrypted",
      "ciphertext",
      "valueBlindIndex",
      "fingerprint",
      "codeHash",
      "dedupeKey",
      "subjectHash",
      "ipHash",
      "sourceKey",
    ]) {
      expect(text).not.toContain(internal);
    }
    // Nothing of anyone else's.
    expect(text).not.toContain(other.user.email);
    expect(text).not.toContain(other.user.id);
  });

  it("is audited and rate limited", async () => {
    const { user } = await populatedAccount("export.limit@example.com");
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await exportAccountData(user, ctx));
    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(results[5]).toEqual({ ok: false, reason: "rate_limited" });
    const first = results[0];
    expect(first.ok && first.filename).toMatch(/^exovault-export-\d{4}-\d{2}-\d{2}\.json$/);
    expect(await AuditLog.countDocuments({ userId: user.id, event: "DATA_EXPORTED" })).toBe(5);
  });
});

describe("account deletion request (spec 5.2)", () => {
  it("refuses a wrong password, schedules nothing, and audits the failure", async () => {
    const { user } = await populatedAccount("wrong.pw@example.com");
    expect(await requestAccountDeletion(user, "not the password", ctx)).toEqual({
      ok: false,
      reason: "invalid_password",
    });
    expect(await getPendingDeletion(user.id)).toBeNull();
    expect(
      await AuditLog.countDocuments({
        userId: user.id,
        event: "ACCOUNT_DELETION_REQUESTED",
        outcome: "failure",
      }),
    ).toBe(1);
  });

  it("limits password guesses", async () => {
    const { user } = await populatedAccount("guesser@example.com");
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await requestAccountDeletion(user, `guess ${i}`, ctx));
    expect(results[5]).toEqual({ ok: false, reason: "rate_limited" });
  });

  it("freezes the account at once and schedules the purge after the grace period", async () => {
    const { user, identityId } = await populatedAccount("leaving@example.com");
    const now = new Date("2026-10-08T10:00:00Z");
    const result = await requestAccountDeletion(user, PASSWORD, ctx, now);
    expect(result).toEqual({ ok: true, purgeAfter: new Date(now.getTime() + 7 * DAY) });

    // Signed out everywhere, monitoring off, pending alerts held back.
    const uid = new Types.ObjectId(user.id);
    expect(await getAuthDb().collection("session").countDocuments({ userId: uid })).toBe(0);
    expect((await Identity.findById(identityId).lean())?.monitoring?.enabled).toBe(false);
    expect(await Notification.countDocuments({ userId: user.id, status: "pending" })).toBe(0);
    expect(await Notification.countDocuments({ suppressionReason: "account_deletion" })).toBe(1);

    // Nothing deleted yet; the address is held only encrypted.
    expect(await Identity.countDocuments({ userId: user.id })).toBe(1);
    const row = await AccountDeletion.findOne({ userId: user.id }).lean();
    expect(JSON.stringify(row)).not.toContain(user.email);

    const email = outbox.outbox.find((m) => m.kind === "account-deletion-scheduled");
    expect(email?.to).toBe(user.email);
    expect(email?.subject).not.toContain(user.email);

    // Asking again doesn't move the date.
    await requestAccountDeletion(user, PASSWORD, ctx, new Date(now.getTime() + DAY));
    expect((await getPendingDeletion(user.id))?.purgeAfter).toEqual(result.ok && result.purgeAfter);
  });

  it("can be cancelled during the grace period, once", async () => {
    const { user } = await populatedAccount("stays@example.com");
    await requestAccountDeletion(user, PASSWORD, ctx);
    expect(await cancelAccountDeletion(user.id, ctx)).toBe(true);
    expect(await cancelAccountDeletion(user.id, ctx)).toBe(false);
    expect(await getPendingDeletion(user.id)).toBeNull();
    expect(await AuditLog.countDocuments({ userId: user.id, event: "ACCOUNT_DELETION_CANCELLED" })).toBe(1);
    // A later purge run leaves the account alone.
    await purgeDueAccounts(new Date(Date.now() + 30 * DAY));
    expect(await getAuthDb().collection("user").countDocuments({ email: user.email })).toBe(1);
  });
});

describe("account purge (worker job)", () => {
  it("does nothing before the grace period ends", async () => {
    const { user } = await populatedAccount("not.yet@example.com");
    await requestAccountDeletion(user, PASSWORD, ctx);
    expect(await purgeDueAccounts(new Date(Date.now() + 6 * DAY))).toEqual({ purged: 0 });
    expect(await Identity.countDocuments({ userId: user.id })).toBe(1);
  });

  it("deletes everything of the user's, anonymises their audit trail, and emails them once", async () => {
    const { user } = await populatedAccount("gone@example.com");
    const other = await populatedAccount("unaffected@example.com");
    await requestAccountDeletion(user, PASSWORD, ctx);
    const auditRowsBefore = await AuditLog.countDocuments({ userId: user.id });
    expect(auditRowsBefore).toBeGreaterThan(0);

    expect(await purgeDueAccounts(new Date(Date.now() + 8 * DAY))).toEqual({ purged: 1 });

    const db = getAuthDb();
    for (const name of [
      "identities",
      "identityVerifications",
      "identityQuotas",
      "exposures",
      "scans",
      "riskScores",
      "remediationActions",
      "notifications",
      "notificationPreferences",
      "pendingSignups",
      "accountDeletions",
    ]) {
      expect(await db.collection(name).countDocuments({ userId: user.id }), name).toBe(0);
    }
    const uid = new Types.ObjectId(user.id);
    expect(await db.collection("user").countDocuments({ _id: uid })).toBe(0);
    expect(await db.collection("account").countDocuments({ userId: uid })).toBe(0);
    expect(await db.collection("session").countDocuments({ userId: uid })).toBe(0);

    // Audit events stay (counted), but nothing links them to the person.
    expect(await AuditLog.countDocuments({ userId: user.id })).toBe(0);
    expect(await AuditLog.countDocuments({ event: "ACCOUNT_DELETED", userId: null })).toBe(1);

    // The address and the user id are gone from the whole database.
    const everything = await wholeDatabase();
    expect(everything).not.toContain(user.email);
    expect(everything).not.toContain(user.id);

    // The other account is untouched.
    expect(await Identity.countDocuments({ userId: other.user.id })).toBe(1);
    expect(await db.collection("user").countDocuments({ email: other.user.email })).toBe(1);

    const completion = outbox.outbox.filter((m) => m.kind === "account-deleted");
    expect(completion.map((m) => m.to)).toEqual([user.email]);
    // A second run finds nothing to do.
    expect(await purgeDueAccounts(new Date(Date.now() + 9 * DAY))).toEqual({ purged: 0 });
  });

  it("resumes after a failure, and a claimed purge can no longer be cancelled", async () => {
    const { user } = await populatedAccount("retry@example.com");
    await requestAccountDeletion(user, PASSWORD, ctx);
    const due = new Date(Date.now() + 8 * DAY);

    setEmailProvider({
      name: "down",
      send: async () => {
        throw new Error("smtp down");
      },
    });
    expect(await purgeDueAccounts(due)).toEqual({ purged: 0 });
    expect((await AccountDeletion.findOne({ userId: user.id }).lean())?.state).toBe("purging");
    expect(await cancelAccountDeletion(user.id, ctx)).toBe(false);

    // Not retried while the claim is fresh; taken over once it's stale.
    setEmailProvider(outbox);
    expect(await purgeDueAccounts(new Date(due.getTime() + 60_000))).toEqual({ purged: 0 });
    expect(await purgeDueAccounts(new Date(due.getTime() + 16 * 60_000))).toEqual({ purged: 1 });
    expect(await AccountDeletion.countDocuments({ userId: user.id })).toBe(0);
    expect(await AuditLog.countDocuments({ event: "ACCOUNT_DELETED" })).toBe(1);
    expect(outbox.outbox.filter((m) => m.kind === "account-deleted")).toHaveLength(1);
  });
});
