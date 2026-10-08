import "server-only";
import { ObjectId } from "mongodb";
import mongoose from "mongoose";
import { getEnv } from "@/config/env";
import { RATE_LIMITS } from "@/config/rate-limits";
import { recordAuditEvent } from "@/lib/audit";
import { getAuth } from "@/lib/auth/server";
import { decryptField, encryptField } from "@/lib/crypto/field-encryption";
import { keyedHash } from "@/lib/crypto/keyed-hash";
import { getAuthDb } from "@/lib/db/mongo-client";
import { connectToDatabase } from "@/lib/db/mongoose";
import { logger } from "@/lib/logging/logger";
import { limit, RateLimitUnavailableError } from "@/lib/rate-limit";
import { formatDateTime } from "@/lib/utils/format";
import { AccountDeletion } from "@/models/AccountDeletion";
import { AuditLog } from "@/models/AuditLog";
import { Exposure } from "@/models/Exposure";
import { Identity } from "@/models/Identity";
import { IdentityQuota } from "@/models/IdentityQuota";
import { IdentityVerification } from "@/models/IdentityVerification";
import { Notification } from "@/models/Notification";
import { NotificationPreference } from "@/models/NotificationPreference";
import { PendingSignup } from "@/models/PendingSignup";
import { RemediationAction } from "@/models/RemediationAction";
import { RiskScore } from "@/models/RiskScore";
import { Scan } from "@/models/Scan";
import { getEmailProvider } from "@/server/providers/email";
import {
  accountDeletedMessage,
  accountDeletionScheduledMessage,
} from "@/server/services/notification/auth-emails";
import { getPreferences } from "@/server/services/notification/notification-service";

/**
 * Account deletion (spec 5.2): confirmation + password re-entry → a grace
 * period during which the account is frozen (monitoring off, alerts held,
 * signed out everywhere) and can be restored by signing in → a resumable
 * purge run by the worker → a completion email → an anonymised audit trail.
 * No transactions (standalone MongoDB): see D-037.
 */

interface Ctx {
  requestId: string | null;
}

/** A purge claim older than this is presumed crashed and taken over. */
const STALE_CLAIM_MS = 15 * 60_000;
/** After this many failed purge runs, finish without the completion email rather than retry forever. */
const MAX_PURGE_ATTEMPTS = 5;

const deletionAad = (userId: string) => `account-deletion:${userId}`;

function toObjectId(id: string): ObjectId | null {
  return ObjectId.isValid(id) && new ObjectId(id).toHexString() === id ? new ObjectId(id) : null;
}

export interface PendingDeletion {
  requestedAt: Date;
  purgeAfter: Date;
}

export async function getPendingDeletion(userId: string): Promise<PendingDeletion | null> {
  await connectToDatabase();
  const row = await AccountDeletion.findOne({ userId }, { requestedAt: 1, purgeAfter: 1 }).lean();
  return row ? { requestedAt: row.requestedAt, purgeAfter: row.purgeAfter } : null;
}

/** Checks the account password without creating a session. Never throws for a wrong password. */
async function passwordMatches(userId: string, password: string): Promise<boolean> {
  const uid = toObjectId(userId);
  const account = uid
    ? await getAuthDb().collection("account").findOne({ userId: uid, providerId: "credential" })
    : null;
  const context = await getAuth().$context;
  if (typeof account?.password !== "string") {
    // Same work either way, so timing doesn't reveal a missing credential.
    await context.password.hash(password);
    return false;
  }
  return context.password.verify({ hash: account.password, password });
}

export type RequestDeletionResult =
  { ok: true; purgeAfter: Date } | { ok: false; reason: "invalid_password" | "rate_limited" | "unavailable" };

export async function requestAccountDeletion(
  user: { id: string; email: string },
  password: string,
  ctx: Ctx,
  now = new Date(),
): Promise<RequestDeletionResult> {
  try {
    const budget = await limit(RATE_LIMITS.reauthPerUser, user.id);
    if (!budget.allowed) {
      await recordAuditEvent({
        event: "RATE_LIMITED",
        outcome: "denied",
        userId: user.id,
        requestId: ctx.requestId,
        metadata: { rule: RATE_LIMITS.reauthPerUser.name },
      });
      return { ok: false, reason: "rate_limited" };
    }
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) return { ok: false, reason: "unavailable" };
    throw error;
  }

  if (!(await passwordMatches(user.id, password))) {
    await recordAuditEvent({
      event: "ACCOUNT_DELETION_REQUESTED",
      outcome: "failure",
      userId: user.id,
      requestId: ctx.requestId,
      metadata: { reason: "invalid_password" },
    });
    return { ok: false, reason: "invalid_password" };
  }

  await connectToDatabase();
  const purgeAfter = new Date(now.getTime() + getEnv().ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60_000);
  // Upsert: asking twice keeps the first date (a second request can't extend or shorten the grace period).
  const row = await AccountDeletion.findOneAndUpdate(
    { userId: user.id },
    {
      $setOnInsert: {
        userId: user.id,
        state: "scheduled",
        requestedAt: now,
        purgeAfter,
        emailEncrypted: encryptField(user.email, deletionAad(user.id)),
      },
    },
    { upsert: true, new: true },
  ).lean();

  await freezeAccount(user.id, now);

  await recordAuditEvent({
    event: "ACCOUNT_DELETION_REQUESTED",
    outcome: "success",
    userId: user.id,
    requestId: ctx.requestId,
    metadata: { purgeAfter: row!.purgeAfter.toISOString() },
  });

  try {
    await getEmailProvider().send(
      accountDeletionScheduledMessage(
        user.email,
        formatDateTime(row!.purgeAfter, { timeZone: (await getPreferences(user.id)).timezone }),
        new URL("/auth/sign-in", getEnv().APP_URL).toString(),
      ),
    );
  } catch (error) {
    // The deletion is scheduled either way; the page the user is looking at says the same thing.
    logger.error(
      { requestId: ctx.requestId, err: error instanceof Error ? error.name : "unknown" },
      "deletion-scheduled email failed",
    );
  }
  return { ok: true, purgeAfter: row!.purgeAfter };
}

/** Stops everything that acts on the user's behalf while deletion is pending. */
async function freezeAccount(userId: string, now: Date): Promise<void> {
  await Identity.updateMany(
    { userId },
    { $set: { "monitoring.enabled": false, "monitoring.frequency": null, "monitoring.nextScanAt": null } },
  );
  await Scan.updateMany(
    { userId, trigger: "scheduled", state: "queued", active: true },
    {
      $set: { state: "failed", failureReason: "cancelled", finishedAt: now, lastProgressAt: now },
      $unset: { active: "" },
      $push: { stateHistory: { state: "failed", at: now } },
    },
  );
  await Notification.updateMany(
    { userId, status: "pending" },
    { $set: { status: "suppressed", suppressionReason: "account_deletion" } },
  );
  const uid = toObjectId(userId);
  if (uid) await getAuthDb().collection("session").deleteMany({ userId: uid });
}

/** Restores an account during its grace period. False when there was nothing (left) to cancel. */
export async function cancelAccountDeletion(userId: string, ctx: Ctx): Promise<boolean> {
  await connectToDatabase();
  // Only while still scheduled: once a purge has claimed the row, it's too late.
  const result = await AccountDeletion.deleteOne({ userId, state: "scheduled" });
  if (result.deletedCount !== 1) return false;
  await recordAuditEvent({
    event: "ACCOUNT_DELETION_CANCELLED",
    outcome: "success",
    userId,
    requestId: ctx.requestId,
  });
  return true;
}

/**
 * Claims and purges every account whose grace period has ended (worker job).
 * Safe to run concurrently and to re-run after a crash.
 */
export async function purgeDueAccounts(now = new Date()): Promise<{ purged: number }> {
  await connectToDatabase();
  let purged = 0;
  for (;;) {
    const claimed = await AccountDeletion.findOneAndUpdate(
      {
        $or: [
          { state: "scheduled", purgeAfter: mongoose.trusted({ $lte: now }) },
          {
            state: "purging",
            claimedAt: mongoose.trusted({ $lt: new Date(now.getTime() - STALE_CLAIM_MS) }),
          },
        ],
      },
      { $set: { state: "purging", claimedAt: now }, $inc: { attempts: 1 } },
      { new: true, sort: { purgeAfter: 1 } },
    ).lean();
    if (!claimed) return { purged };
    try {
      await purgeAccount(claimed.userId, claimed.emailEncrypted, claimed.attempts, now);
      purged += 1;
    } catch (error) {
      // Left in `purging`; the next run after STALE_CLAIM_MS resumes it.
      logger.error({ err: error instanceof Error ? error.name : "unknown" }, "account purge failed");
      return { purged };
    }
  }
}

async function purgeAccount(
  userId: string,
  emailEncrypted: Parameters<typeof decryptField>[0],
  attempts: number,
  now: Date,
): Promise<void> {
  const email = decryptField(emailEncrypted, deletionAad(userId));

  // Product data. Every step is an idempotent delete scoped by userId.
  await Promise.all([
    Scan.deleteMany({ userId }),
    Exposure.deleteMany({ userId }),
    RemediationAction.deleteMany({ userId }),
    RiskScore.deleteMany({ userId }),
    Notification.deleteMany({ userId }),
    NotificationPreference.deleteMany({ userId }),
    IdentityVerification.deleteMany({ userId }),
    IdentityQuota.deleteMany({ userId }),
    PendingSignup.deleteMany({ userId }),
  ]);
  await Identity.deleteMany({ userId });

  // Auth data (Better Auth's collections). The user row goes last, so a crash leaves it findable for the retry.
  const uid = toObjectId(userId);
  const authDb = getAuthDb();
  if (uid) {
    await authDb.collection("session").deleteMany({ userId: uid });
    await authDb.collection("account").deleteMany({ userId: uid });
  }
  // Password-reset tokens store the user id as their value. Sign-up codes hold no user id and expire in minutes.
  await authDb.collection("verification").deleteMany({ value: userId });
  if (uid) await authDb.collection("user").deleteOne({ _id: uid });

  // Audit trail (spec 5.2): keep the events, drop the link to the person. The model is append-only for
  // application code; this anonymiser is its one sanctioned writer, so it goes through the driver.
  await AuditLog.collection.updateMany(
    { $or: [{ userId }, { subjectHash: keyedHash("audit-subject", email.trim().toLowerCase()) }] },
    { $set: { userId: null, subjectHash: null } },
  );

  try {
    await getEmailProvider().send(accountDeletedMessage(email));
  } catch (error) {
    if (attempts < MAX_PURGE_ATTEMPTS) throw error;
    logger.error(
      { attempts, err: error instanceof Error ? error.name : "unknown" },
      "deletion-complete email failed; giving up",
    );
  }
  // Recorded once, after the only step that can make us retry; carries no user reference.
  await recordAuditEvent({ event: "ACCOUNT_DELETED", outcome: "success", userId: null });
  // Last: removes the final copy of the address.
  await AccountDeletion.deleteOne({ userId, state: "purging" });
  logger.info({ at: now.toISOString() }, "account purged");
}
