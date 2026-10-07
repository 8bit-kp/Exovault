import mongoose, { Types } from "mongoose";
import { recordAuditEvent } from "@/lib/audit";
import { connectToDatabase } from "@/lib/db/mongoose";
import {
  computeNextScanAt,
  firstScheduledScanAt,
  MONITORING_FREQUENCIES,
  type MonitoringFrequency,
  type MonitoringState,
} from "@/lib/domain/monitoring";
import { logger } from "@/lib/logging/logger";
import { Identity } from "@/models/Identity";
import { Scan } from "@/models/Scan";
import { startScheduledScan } from "@/server/services/scan/scan-service";

/**
 * Scheduled monitoring (spec Part 10). The database is the source of truth:
 * each identity stores `monitoring {enabled, frequency, nextScanAt}`. The
 * worker's tick claims due identities with a compare-and-set on
 * `nextScanAt`, so two workers (or a restart mid-tick) can't schedule the
 * same identity twice. Overdue identities are simply due on the next tick,
 * which is how state is reconciled after downtime.
 */

export interface Ctx {
  requestId: string | null;
}

function objectId(id: string): Types.ObjectId | null {
  return Types.ObjectId.isValid(id) && new Types.ObjectId(id).toHexString() === id
    ? new Types.ObjectId(id)
    : null;
}

export type MonitoringResult =
  | { ok: true; nextScanAt: Date | null }
  | { ok: false; reason: "not_found" | "not_verified" | "invalid_frequency" };

export async function enableMonitoring(
  userId: string,
  identityId: string,
  frequency: unknown,
  ctx: Ctx,
  now = new Date(),
): Promise<MonitoringResult> {
  if (!MONITORING_FREQUENCIES.includes(frequency as MonitoringFrequency))
    return { ok: false, reason: "invalid_frequency" };
  const _id = objectId(identityId);
  if (!_id) return { ok: false, reason: "not_found" };
  await connectToDatabase();
  const identity = await Identity.findOne({ _id, userId, status: "active" }).lean();
  if (!identity) return { ok: false, reason: "not_found" };
  if (identity.verificationStatus !== "verified") return { ok: false, reason: "not_verified" };

  const nextScanAt = firstScheduledScanAt(now, identity.lastScanAt ?? null, frequency as MonitoringFrequency);
  await Identity.updateOne(
    { _id, userId },
    {
      $set: {
        "monitoring.enabled": true,
        "monitoring.frequency": frequency,
        "monitoring.nextScanAt": nextScanAt,
      },
    },
  );
  await recordAuditEvent({
    event: "MONITORING_ENABLED",
    outcome: "success",
    userId,
    requestId: ctx.requestId,
    metadata: { identityId, frequency: frequency as string },
  });
  return { ok: true, nextScanAt };
}

/** Turns monitoring off and cancels scheduled scans that haven't started (spec Part 10). */
export async function disableMonitoring(
  userId: string,
  identityId: string,
  ctx: Ctx,
  now = new Date(),
): Promise<MonitoringResult> {
  const _id = objectId(identityId);
  if (!_id) return { ok: false, reason: "not_found" };
  await connectToDatabase();
  const result = await Identity.updateOne(
    { _id, userId, status: "active" },
    { $set: { "monitoring.enabled": false, "monitoring.frequency": null, "monitoring.nextScanAt": null } },
  );
  if (result.matchedCount === 0) return { ok: false, reason: "not_found" };
  await Scan.updateMany(
    { identityId: _id, userId, trigger: "scheduled", state: "queued", active: true },
    {
      $set: { state: "failed", failureReason: "cancelled", finishedAt: now, lastProgressAt: now },
      $unset: { active: "" },
      $push: { stateHistory: { state: "failed", at: now } },
    },
  );
  await recordAuditEvent({
    event: "MONITORING_DISABLED",
    outcome: "success",
    userId,
    requestId: ctx.requestId,
    metadata: { identityId },
  });
  return { ok: true, nextScanAt: null };
}

/**
 * Claims identities whose scheduled scan is due, moving each one's
 * `nextScanAt` forward in the same atomic step. Returns only those this
 * caller won.
 */
export async function claimDueIdentities(
  now = new Date(),
  limit = 100,
): Promise<Array<{ userId: string; identityId: string }>> {
  await connectToDatabase();
  const due = await Identity.find({
    status: "active",
    verificationStatus: "verified",
    "monitoring.enabled": true,
    "monitoring.nextScanAt": mongoose.trusted({ $lte: now }),
  })
    .select({ userId: 1, "monitoring.frequency": 1, "monitoring.nextScanAt": 1 })
    .sort({ "monitoring.nextScanAt": 1 })
    .limit(limit)
    .lean();

  const claimed: Array<{ userId: string; identityId: string }> = [];
  for (const identity of due) {
    const frequency = (identity.monitoring?.frequency ?? "24h") as MonitoringFrequency;
    const result = await Identity.updateOne(
      {
        _id: identity._id,
        "monitoring.enabled": true,
        "monitoring.nextScanAt": identity.monitoring?.nextScanAt,
      },
      { $set: { "monitoring.nextScanAt": computeNextScanAt(now, frequency) } },
    );
    if (result.modifiedCount === 1)
      claimed.push({ userId: identity.userId, identityId: String(identity._id) });
  }
  return claimed;
}

/** One scheduler tick: claim due identities and start their scans. Safe to run concurrently. */
export async function runMonitoringTick(now = new Date()): Promise<{ claimed: number; started: number }> {
  const claimed = await claimDueIdentities(now);
  let started = 0;
  for (const { userId, identityId } of claimed) {
    try {
      const result = await startScheduledScan(userId, identityId, now);
      if (result.ok && !result.reused) started += 1;
    } catch (error) {
      logger.error(
        { identityId, err: error instanceof Error ? error.name : "unknown" },
        "scheduled scan failed to start",
      );
    }
  }
  if (claimed.length > 0) logger.info({ claimed: claimed.length, started }, "monitoring tick");
  return { claimed: claimed.length, started };
}

export interface MonitoringView {
  identityId: string;
  state: MonitoringState;
  frequency: MonitoringFrequency | null;
  nextScanAt: string | null;
  lastScanAt: string | null;
}

/** UI state. "degraded" when monitoring is on but the latest scheduled scan failed. */
export async function getMonitoringView(userId: string, identityId: string): Promise<MonitoringView | null> {
  const _id = objectId(identityId);
  if (!_id) return null;
  await connectToDatabase();
  const identity = await Identity.findOne({ _id, userId, status: "active" }).lean();
  if (!identity) return null;
  const enabled = Boolean(identity.monitoring?.enabled);
  let state: MonitoringState = enabled ? "active" : "off";
  if (enabled) {
    const lastScheduled = await Scan.findOne({ identityId: _id, userId, trigger: "scheduled" })
      .sort({ createdAt: -1 })
      .select({ state: 1, failureReason: 1 })
      .lean();
    if (lastScheduled?.state === "failed" && lastScheduled.failureReason !== "cancelled") state = "degraded";
  }
  return {
    identityId,
    state,
    frequency: (identity.monitoring?.frequency as MonitoringFrequency | null) ?? null,
    nextScanAt:
      enabled && identity.monitoring?.nextScanAt ? identity.monitoring.nextScanAt.toISOString() : null,
    lastScanAt: identity.lastScanAt ? identity.lastScanAt.toISOString() : null,
  };
}
