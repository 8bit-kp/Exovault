import mongoose, { Types } from "mongoose";
import { z } from "zod";
import { getEnv } from "@/config/env";
import { recordAuditEvent } from "@/lib/audit";
import { seal, unseal } from "@/lib/crypto/sealed";
import { getAuthDb } from "@/lib/db/mongo-client";
import { connectToDatabase } from "@/lib/db/mongoose";
import { EXPOSURE_SEVERITIES, type ExposureSeverity } from "@/lib/domain/exposure";
import {
  DEFAULT_PREFERENCES,
  DELIVERY_MODES,
  dedupeKey,
  HHMM,
  inQuietHours,
  isValidTimeZone,
  nextDeliveryTime,
  nextDigestTime,
  suppressionReason,
  type NotificationPreferences,
} from "@/lib/domain/notifications";
import { getRemediationChecklist } from "@/lib/domain/remediation";
import { logger } from "@/lib/logging/logger";
import { Exposure } from "@/models/Exposure";
import { Identity } from "@/models/Identity";
import { Notification, type NotificationDoc } from "@/models/Notification";
import { NotificationPreference } from "@/models/NotificationPreference";
import { emailNotificationProvider } from "@/server/providers/notifications/email";
import type { AlertItem, NotificationProvider } from "@/server/providers/notifications/interface";

/**
 * Exposure alerts (spec Part 10, D-033).
 *  - Created from scheduled scans only, for NEW and escalated exposures,
 *    idempotently (unique dedupe key): the same event never alerts twice.
 *  - Dispatched by the worker: claim (compare-and-set) → re-check
 *    preferences and quiet hours → one email per user per run → sent, or
 *    retried with backoff, then failed after MAX_ATTEMPTS.
 */
export const MAX_ATTEMPTS = 3;
const STALE_SENDING_MS = 10 * 60_000;
const UNSUBSCRIBE_TTL_SECONDS = 90 * 24 * 60 * 60;

type NotificationRow = NotificationDoc & { _id: Types.ObjectId };

/* ---------------- preferences ---------------- */

export async function getPreferences(userId: string): Promise<NotificationPreferences> {
  await connectToDatabase();
  const doc = await NotificationPreference.findOne({ userId }).lean();
  if (!doc) return DEFAULT_PREFERENCES;
  return {
    emailEnabled: doc.emailEnabled,
    minSeverity: doc.minSeverity,
    mode: doc.mode,
    quietHours: {
      enabled: Boolean(doc.quietHours?.enabled),
      start: doc.quietHours?.start ?? "22:00",
      end: doc.quietHours?.end ?? "07:00",
    },
    timezone: doc.timezone,
  };
}

export const preferencesSchema = z.object({
  emailEnabled: z.boolean(),
  minSeverity: z.enum(EXPOSURE_SEVERITIES),
  mode: z.enum(DELIVERY_MODES),
  quietHours: z.object({ enabled: z.boolean(), start: z.string().regex(HHMM), end: z.string().regex(HHMM) }),
  timezone: z.string().refine(isValidTimeZone, "Choose a valid timezone."),
});

export async function updatePreferences(
  userId: string,
  input: unknown,
  ctx: { requestId: string | null },
): Promise<
  { ok: true; preferences: NotificationPreferences } | { ok: false; errors: Record<string, string> }
> {
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[issue.path.join(".") || "form"] ??= issue.message;
    return { ok: false, errors };
  }
  await connectToDatabase();
  await NotificationPreference.updateOne({ userId }, { $set: { ...parsed.data, userId } }, { upsert: true });
  await recordAuditEvent({
    event: "ACCOUNT_SETTINGS_CHANGED",
    outcome: "success",
    userId,
    requestId: ctx.requestId,
    metadata: { setting: "notifications", emailEnabled: parsed.data.emailEnabled, mode: parsed.data.mode },
  });
  return { ok: true, preferences: parsed.data };
}

/* ---------------- unsubscribe (one click, no sign-in) ---------------- */

export function createUnsubscribeToken(userId: string): string {
  return seal("unsubscribe", { userId }, UNSUBSCRIBE_TTL_SECONDS);
}

export async function unsubscribeWithToken(token: string | undefined): Promise<boolean> {
  const payload = unseal<{ userId: string }>("unsubscribe", token);
  if (!payload || typeof payload.userId !== "string") return false;
  await connectToDatabase();
  await NotificationPreference.updateOne(
    { userId: payload.userId },
    { $set: { emailEnabled: false }, $setOnInsert: { userId: payload.userId } },
    { upsert: true },
  );
  await recordAuditEvent({
    event: "ACCOUNT_SETTINGS_CHANGED",
    outcome: "success",
    userId: payload.userId,
    metadata: { setting: "notifications", emailEnabled: false, via: "unsubscribe_link" },
  });
  return true;
}

/* ---------------- creation ---------------- */

/**
 * Records alerts for a scheduled scan's new and escalated exposures. Safe to
 * call twice for the same scan: the dedupe key makes creation idempotent.
 */
export async function createNotificationsForScan(input: {
  userId: string;
  identityId: string;
  scanId: string;
  newExposureIds: string[];
  escalatedExposureIds: string[];
  now?: Date;
}): Promise<number> {
  const events = [
    ...input.newExposureIds.map((id) => ({ id, kind: "new_exposure" as const })),
    ...input.escalatedExposureIds.map((id) => ({ id, kind: "exposure_changed" as const })),
  ];
  if (events.length === 0) return 0;
  await connectToDatabase();
  const now = input.now ?? new Date();
  const prefs = await getPreferences(input.userId);
  const exposures = await Exposure.find({
    _id: mongoose.trusted({ $in: events.map((e) => new Types.ObjectId(e.id)) }),
    userId: input.userId,
  })
    .select({ fingerprint: 1, severity: 1, identityId: 1 })
    .lean();
  const byId = new Map(exposures.map((e) => [String(e._id), e]));

  let created = 0;
  for (const event of events) {
    const exposure = byId.get(event.id);
    if (!exposure) continue;
    const reason = suppressionReason(exposure.severity, prefs);
    const digest = prefs.mode === "digest";
    const key = dedupeKey({
      identityId: input.identityId,
      fingerprint: exposure.fingerprint,
      channel: "email",
      kind: event.kind,
      severity: exposure.severity,
    });
    const result = await Notification.updateOne(
      { dedupeKey: key },
      {
        $setOnInsert: {
          userId: input.userId,
          identityId: new Types.ObjectId(input.identityId),
          exposureId: exposure._id,
          scanId: new Types.ObjectId(input.scanId),
          channel: "email",
          kind: event.kind,
          severity: exposure.severity,
          dedupeKey: key,
          status: reason ? "suppressed" : "pending",
          suppressionReason: reason,
          digest,
          scheduledFor: digest ? nextDigestTime(now, prefs.timezone) : nextDeliveryTime(now, prefs),
        },
      },
      { upsert: true },
    );
    if (result.upsertedCount === 1) created += 1;
  }
  return created;
}

/* ---------------- dispatch (worker) ---------------- */

let providerOverride: NotificationProvider | undefined;
/** Test seam. */
export function setNotificationProvider(provider: NotificationProvider | undefined): void {
  providerOverride = provider;
}

async function accountEmail(userId: string): Promise<string | null> {
  if (!Types.ObjectId.isValid(userId)) return null;
  const user = await getAuthDb()
    .collection("user")
    .findOne({ _id: new Types.ObjectId(userId) }, { projection: { email: 1, emailVerified: 1 } });
  return user?.emailVerified && typeof user.email === "string" ? user.email : null;
}

async function settle(ids: Types.ObjectId[], update: Record<string, unknown>) {
  if (ids.length > 0)
    await Notification.updateMany({ _id: mongoose.trusted({ $in: ids }), status: "sending" }, update);
}

/** One dispatch run. Returns how many notifications were sent. Safe to run concurrently. */
export async function dispatchDueNotifications(now = new Date()): Promise<{ sent: number; emails: number }> {
  await connectToDatabase();
  const env = getEnv();
  const provider = providerOverride ?? emailNotificationProvider();

  // A worker that died mid-send leaves "sending" rows: put them back (at-least-once delivery, D-033).
  await Notification.updateMany(
    {
      status: "sending",
      lastAttemptAt: mongoose.trusted({ $lt: new Date(now.getTime() - STALE_SENDING_MS) }),
    },
    { $set: { status: "pending" } },
  );

  const due = await Notification.find({ status: "pending", scheduledFor: mongoose.trusted({ $lte: now }) })
    .sort({ scheduledFor: 1 })
    .limit(500)
    .lean<NotificationRow[]>();

  // Claim each row (compare-and-set) so concurrent dispatchers never send the same one.
  const claimed: NotificationRow[] = [];
  for (const row of due) {
    const result = await Notification.updateOne(
      { _id: row._id, status: "pending" },
      { $set: { status: "sending", lastAttemptAt: now }, $inc: { attempts: 1 } },
    );
    if (result.modifiedCount === 1) claimed.push({ ...row, attempts: row.attempts + 1 });
  }

  const byUser = new Map<string, NotificationRow[]>();
  for (const row of claimed) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);

  let sent = 0;
  let emails = 0;
  for (const [userId, rows] of byUser) {
    const prefs = await getPreferences(userId);

    // Preferences may have changed since creation: re-check before sending.
    const reasonFor = (row: NotificationRow) => suppressionReason(row.severity as ExposureSeverity, prefs);
    const suppressed = rows.filter((r) => reasonFor(r));
    for (const row of suppressed) {
      await settle([row._id], { $set: { status: "suppressed", suppressionReason: reasonFor(row) } });
    }
    let sendable = rows.filter((r) => !reasonFor(r));
    if (sendable.length === 0) continue;

    if (inQuietHours(now, prefs) && sendable.some((r) => !r.digest)) {
      const later = nextDeliveryTime(now, prefs);
      const immediate = sendable.filter((r) => !r.digest);
      await settle(
        immediate.map((r) => r._id),
        { $set: { status: "pending", scheduledFor: later } },
      );
      sendable = sendable.filter((r) => r.digest);
      if (sendable.length === 0) continue;
    }

    const exposures = await Exposure.find({
      _id: mongoose.trusted({ $in: sendable.map((r) => r.exposureId) }),
      userId,
    }).lean();
    const exposureById = new Map(exposures.map((e) => [String(e._id), e]));
    const gone = sendable.filter((r) => !exposureById.has(String(r.exposureId)));
    await settle(
      gone.map((r) => r._id),
      { $set: { status: "suppressed", suppressionReason: "exposure_removed" } },
    );
    sendable = sendable.filter((r) => exposureById.has(String(r.exposureId)));
    if (sendable.length === 0) continue;

    const to = await accountEmail(userId);
    if (!to) {
      await settle(
        sendable.map((r) => r._id),
        { $set: { status: "failed" } },
      );
      continue;
    }
    const identities = await Identity.find({ userId }, { valueMasked: 1 }).lean();
    const masked = new Map(identities.map((i) => [String(i._id), i.valueMasked]));

    const items: AlertItem[] = sendable.map((row) => {
      const e = exposureById.get(String(row.exposureId))!;
      return {
        kind: row.kind,
        severity: e.severity,
        sourceName: e.isSensitiveSource ? null : e.sourceName,
        identityMasked: masked.get(String(e.identityId)) ?? "your monitored address",
        detectedAt: e.firstSeenAt,
        recommendedAction:
          getRemediationChecklist({ dataTypes: e.exposedDataTypes, sourceType: e.sourceType })[0]?.label ??
          "Review the exposure",
        link: `${env.APP_URL}/app/exposures/${String(e._id)}`,
      };
    });

    const token = createUnsubscribeToken(userId);
    try {
      await provider.send({
        to,
        items,
        digest: sendable.every((r) => r.digest),
        timezone: prefs.timezone,
        preferencesUrl: `${env.APP_URL}/app/settings/notifications`,
        unsubscribeUrl: `${env.APP_URL}/notifications/unsubscribe?token=${encodeURIComponent(token)}`,
        oneClickUnsubscribeUrl: `${env.APP_URL}/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`,
      });
      await settle(
        sendable.map((r) => r._id),
        { $set: { status: "sent", sentAt: now } },
      );
      sent += sendable.length;
      emails += 1;
      await recordAuditEvent({
        event: "NOTIFICATION_SENT",
        outcome: "success",
        userId,
        metadata: {
          channel: provider.channel,
          count: sendable.length,
          digest: sendable.every((r) => r.digest),
        },
      });
    } catch (error) {
      logger.error(
        { userId, count: sendable.length, err: error instanceof Error ? error.name : "unknown" },
        "alert send failed",
      );
      for (const row of sendable) {
        await settle(
          [row._id],
          row.attempts >= MAX_ATTEMPTS
            ? { $set: { status: "failed" } }
            : {
                $set: {
                  status: "pending",
                  scheduledFor: new Date(now.getTime() + row.attempts * 5 * 60_000),
                },
              },
        );
      }
    }
  }
  return { sent, emails };
}

/* ---------------- inbox ---------------- */

export interface NotificationView {
  id: string;
  kind: NotificationDoc["kind"];
  severity: ExposureSeverity;
  status: NotificationDoc["status"];
  suppressionReason: NotificationDoc["suppressionReason"];
  digest: boolean;
  scheduledFor: string;
  sentAt: string | null;
  createdAt: string;
  read: boolean;
  exposureId: string;
  /** Null if the exposure is sensitive (hidden) or no longer exists. */
  sourceName: string | null;
  exposureExists: boolean;
}

export async function listNotifications(userId: string, limit = 50): Promise<NotificationView[]> {
  await connectToDatabase();
  const rows = await Notification.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<NotificationRow[]>();
  const exposures = await Exposure.find(
    { _id: mongoose.trusted({ $in: rows.map((r) => r.exposureId) }), userId },
    { sourceName: 1, isSensitiveSource: 1 },
  ).lean();
  const byId = new Map(exposures.map((e) => [String(e._id), e]));
  return rows.map((row) => {
    const e = byId.get(String(row.exposureId));
    return {
      id: String(row._id),
      kind: row.kind,
      severity: row.severity as ExposureSeverity,
      status: row.status,
      suppressionReason: row.suppressionReason ?? null,
      digest: row.digest,
      scheduledFor: row.scheduledFor.toISOString(),
      sentAt: row.sentAt ? row.sentAt.toISOString() : null,
      createdAt: (row as unknown as { createdAt: Date }).createdAt.toISOString(),
      read: Boolean(row.readAt),
      exposureId: String(row.exposureId),
      sourceName: e && !e.isSensitiveSource ? e.sourceName : null,
      exposureExists: Boolean(e),
    };
  });
}

export async function markAllRead(userId: string, now = new Date()): Promise<void> {
  await connectToDatabase();
  await Notification.updateMany({ userId, readAt: null }, { $set: { readAt: now } });
}

export async function unreadCount(userId: string): Promise<number> {
  await connectToDatabase();
  return Notification.countDocuments({ userId, readAt: null });
}
