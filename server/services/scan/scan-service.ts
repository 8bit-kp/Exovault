import "server-only";
import { Types } from "mongoose";
import { RATE_LIMITS } from "@/config/rate-limits";
import { recordAuditEvent } from "@/lib/audit";
import { connectToDatabase } from "@/lib/db/mongoose";
import { parseObjectId } from "@/lib/db/object-id";
import { EXPOSURE_SEVERITIES, type ExposureSeverity, type ScanState } from "@/lib/domain/exposure";
import {
  MANUAL_SCAN_COOLDOWN_MS,
  SCAN_STALE_AFTER_MS,
  type ScanFailureReason,
  type ScanTrigger,
} from "@/lib/domain/scan";
import { logger } from "@/lib/logging/logger";
import { limit, RateLimitUnavailableError } from "@/lib/rate-limit";
import { Exposure } from "@/models/Exposure";
import { Identity } from "@/models/Identity";
import type { ExposureProvider } from "@/server/providers/exposure/interface";
import { getExposureProviders } from "@/server/providers/exposure/registry";
import {
  ActiveScanExistsError,
  failStaleScans,
  findActiveScanForIdentity,
  findScanById,
  findScanForUser,
  insertScan,
  latestCountedManualScan,
  latestScanForIdentity,
  recordScanProviderResult,
  transitionScan,
  type ScanRecord,
} from "@/server/repositories/scan-repository";
import { deduplicateExposures } from "@/server/services/exposure/dedupe";
import { runProviders } from "@/server/services/exposure/engine";
import { outcomeOf } from "@/server/services/exposure/exposure-service";
import { persistExposures } from "@/server/services/exposure/persistence";
import type { RetryPolicy } from "@/server/services/exposure/resilience";
import { getIdentity, withDecryptedIdentity } from "@/server/services/identity/identity-service";
import { recomputeRiskScore } from "@/server/services/risk/risk-service";
import { createNotificationsForScan } from "@/server/services/notification/notification-service";
import { getEnv } from "@/config/env";
import { createBullmqScanQueue } from "./bullmq-queue";
import { createInProcessQueue, type ScanQueue } from "./queue";

/**
 * Scan lifecycle (spec Part 8). Starting a scan is cheap and synchronous
 * (validate → lock → enqueue); the processor does the work and persists each
 * state as it really happens, so progress the UI shows is never invented.
 */

export interface Ctx {
  requestId: string | null;
}

/* ---------------- queue wiring ---------------- */

const globalCache = globalThis as typeof globalThis & { __exovaultScanQueue?: ScanQueue };
let processorOptions: { providers?: ExposureProvider[]; policy?: RetryPolicy } = {};

export function getScanQueue(): ScanQueue {
  globalCache.__exovaultScanQueue ??=
    getEnv().SCAN_QUEUE === "bullmq"
      ? createBullmqScanQueue()
      : createInProcessQueue((scanId) => processScan(scanId));
  return globalCache.__exovaultScanQueue;
}

/** Test seam: use a specific queue (e.g. BullMQ with an isolated prefix). */
export function setScanQueue(queue: ScanQueue | undefined): void {
  globalCache.__exovaultScanQueue = queue;
}

/** Test seam: providers/policy used by the processor, and a fresh queue. */
export function configureScanProcessing(options: {
  providers?: ExposureProvider[];
  policy?: RetryPolicy;
}): void {
  processorOptions = options;
  globalCache.__exovaultScanQueue = undefined;
}

function providersFor(names?: string[]): ExposureProvider[] {
  const all = processorOptions.providers ?? getExposureProviders();
  return names ? all.filter((p) => names.includes(p.getName())) : all;
}

/* ---------------- starting scans ---------------- */

export type StartScanResult =
  | { ok: true; scanId: string; reused: boolean }
  | { ok: false; reason: "not_found" | "not_verified" | "unavailable" }
  | { ok: false; reason: "cooldown" | "rate_limited"; retryAfterSeconds: number }
  | { ok: false; reason: "not_retryable" };

async function createAndEnqueue(input: {
  userId: string;
  identityId: Types.ObjectId;
  trigger: ScanTrigger;
  providers: ExposureProvider[];
  retryOfScanId?: Types.ObjectId;
  ctx: Ctx;
}): Promise<StartScanResult> {
  try {
    const scan = await insertScan({
      userId: input.userId,
      identityId: input.identityId,
      trigger: input.trigger,
      retryOfScanId: input.retryOfScanId,
      providers: input.providers.map((p) => ({
        name: p.getName(),
        isDemo: Boolean(p.getCapabilities().isDemo),
      })),
    });
    const scanId = scan._id.toHexString();
    await recordAuditEvent({
      event: "SCAN_STARTED",
      outcome: "success",
      userId: input.userId,
      requestId: input.ctx.requestId,
      metadata: { scanId, identityId: input.identityId.toHexString(), trigger: input.trigger },
    });
    getScanQueue().enqueue(scanId);
    return { ok: true, scanId, reused: false };
  } catch (error) {
    if (!(error instanceof ActiveScanExistsError)) throw error;
    // Spec Part 8: a duplicate start returns the scan already in progress.
    const active = await findActiveScanForIdentity(input.identityId);
    if (active) return { ok: true, scanId: active._id.toHexString(), reused: true };
    throw error;
  }
}

export async function startManualScan(
  userId: string,
  identityId: string,
  ctx: Ctx,
  now = new Date(),
): Promise<StartScanResult> {
  const identity = await getIdentity(userId, identityId);
  if (!identity) return { ok: false, reason: "not_found" };
  if (identity.verification !== "verified") return { ok: false, reason: "not_verified" };
  const _id = new Types.ObjectId(identity.id);

  await failStaleScans(_id, new Date(now.getTime() - SCAN_STALE_AFTER_MS), now);
  const active = await findActiveScanForIdentity(_id);
  if (active) return { ok: true, scanId: active._id.toHexString(), reused: true };

  const recent = await latestCountedManualScan(
    userId,
    _id,
    new Date(now.getTime() - MANUAL_SCAN_COOLDOWN_MS),
  );
  if (recent) {
    // A concurrent start may have just created it: that's "already running", not "cooldown".
    if (recent.active) return { ok: true, scanId: recent._id.toHexString(), reused: true };
    const retryAfterMs = recent.createdAt.getTime() + MANUAL_SCAN_COOLDOWN_MS - now.getTime();
    return { ok: false, reason: "cooldown", retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }
  return createAndEnqueue({ userId, identityId: _id, trigger: "manual", providers: providersFor(), ctx });
}

/**
 * A scheduled scan (spec Part 10): no cooldown (the schedule is the limit),
 * only for verified identities with monitoring on. Skips if a scan is running.
 */
export async function startScheduledScan(
  userId: string,
  identityId: string,
  now = new Date(),
): Promise<StartScanResult> {
  const identity = await getIdentity(userId, identityId);
  if (!identity) return { ok: false, reason: "not_found" };
  if (identity.verification !== "verified") return { ok: false, reason: "not_verified" };
  const _id = new Types.ObjectId(identity.id);
  await failStaleScans(_id, new Date(now.getTime() - SCAN_STALE_AFTER_MS), now);
  const active = await findActiveScanForIdentity(_id);
  if (active) return { ok: true, scanId: active._id.toHexString(), reused: true };
  return createAndEnqueue({
    userId,
    identityId: _id,
    trigger: "scheduled",
    providers: providersFor(),
    ctx: { requestId: null },
  });
}

/** "Retry failed source" on a partial scan: rescans only the providers that failed. */
export async function retryFailedSources(userId: string, scanId: string, ctx: Ctx): Promise<StartScanResult> {
  const scan = await findScanForUser(userId, scanId);
  if (!scan) return { ok: false, reason: "not_found" };
  const failed = scan.providerResults.filter((r) => r.state === "error").map((r) => r.provider);
  if (scan.state !== "partial" && scan.state !== "failed") return { ok: false, reason: "not_retryable" };
  if (failed.length === 0) return { ok: false, reason: "not_retryable" };

  const identity = await getIdentity(userId, scan.identityId.toHexString());
  if (!identity) return { ok: false, reason: "not_found" };
  if (identity.verification !== "verified") return { ok: false, reason: "not_verified" };

  try {
    const result = await limit(RATE_LIMITS.scanRetryPerIdentity, identity.id);
    if (!result.allowed) {
      return { ok: false, reason: "rate_limited", retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000) };
    }
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) return { ok: false, reason: "unavailable" };
    throw error;
  }

  const providers = providersFor(failed);
  if (providers.length === 0) return { ok: false, reason: "not_retryable" };
  return createAndEnqueue({
    userId,
    identityId: scan.identityId,
    trigger: "retry",
    providers,
    retryOfScanId: scan._id,
    ctx,
  });
}

/* ---------------- processing ---------------- */

async function activeCountsBySeverity(userId: string, identityId: Types.ObjectId) {
  const rows = await Exposure.aggregate<{ _id: ExposureSeverity; count: number }>([
    {
      $match: {
        userId,
        identityId,
        detectionState: { $ne: "no_longer_reported" },
        remediationState: { $nin: ["remediated", "dismissed"] },
      },
    },
    { $group: { _id: "$severity", count: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(EXPOSURE_SEVERITIES.map((s) => [s, 0])) as Record<
    ExposureSeverity,
    number
  >;
  for (const row of rows) counts[row._id] = row.count;
  return counts;
}

async function fail(scan: ScanRecord, from: ScanState, reason: ScanFailureReason, requestId: string | null) {
  if (await transitionScan(scan._id, from, "failed", { failureReason: reason })) {
    await recordAuditEvent({
      event: "SCAN_FAILED",
      outcome: "failure",
      userId: scan.userId,
      requestId,
      metadata: { scanId: scan._id.toHexString(), reason },
    });
  }
}

/** Runs one queued scan to a terminal state. Safe to call twice: only one caller wins the queued → running step. */
export async function processScan(scanId: string): Promise<void> {
  const scan = await findScanById(new Types.ObjectId(scanId));
  if (!scan || scan.state !== "queued") return;
  if (!(await transitionScan(scan._id, "queued", "running"))) return;

  let state: ScanState = "running";
  try {
    // running: real provider calls; each source's result is persisted as it settles.
    const providers = providersFor(scan.providerResults.map((p) => p.provider));
    const searched = await withDecryptedIdentity(scan.userId, scan.identityId.toHexString(), (identifier) =>
      runProviders(identifier, {
        providers,
        scanId,
        policy: processorOptions.policy,
        onProviderSettled: (result) => recordScanProviderResult(scan._id, result),
      }),
    );
    if (!searched.ok) return fail(scan, state, "interrupted", null); // identity removed/unverified mid-scan

    const { providerResults, exposures } = searched.value;
    const outcome = outcomeOf(providerResults);
    if (outcome === "failed") return fail(scan, state, "all_sources_failed", null);

    // normalizing: merge duplicate reports into distinct incidents.
    if (!(await transitionScan(scan._id, "running", "normalizing"))) return;
    state = "normalizing";
    const distinct = deduplicateExposures(exposures);

    // matching: match against stored exposures and persist (idempotent upserts).
    if (!(await transitionScan(scan._id, "normalizing", "matching"))) return;
    state = "matching";
    const diff = await persistExposures({
      userId: scan.userId,
      identityId: scan.identityId.toHexString(),
      exposures: distinct,
      providerResults,
    });

    // scoring: active exposures by severity + a new Exposure Risk Score snapshot for the user.
    if (!(await transitionScan(scan._id, "matching", "scoring"))) return;
    state = "scoring";
    const activeBySeverity = await activeCountsBySeverity(scan.userId, scan.identityId);
    await recomputeRiskScore(scan.userId, "scan", { scanId });

    const summary = {
      new: diff.new.length,
      changed: diff.changed.length,
      existing: diff.existing.length,
      noLongerReported: diff.noLongerReported.length,
      activeBySeverity,
    };
    if (!(await transitionScan(scan._id, "scoring", outcome, { summary }))) return;
    await connectToDatabase();
    await Identity.updateOne(
      { _id: scan.identityId, userId: scan.userId },
      { $set: { lastScanAt: new Date() } },
    );

    await recordAuditEvent({
      event: "SCAN_COMPLETED",
      outcome: "success",
      userId: scan.userId,
      metadata: { scanId, outcome, new: summary.new, changed: summary.changed },
    });
    // Alerts only for monitoring: a manual scan's results are already on the user's screen (D-033).
    if (scan.trigger === "scheduled" && (diff.new.length > 0 || diff.escalated.length > 0)) {
      try {
        await createNotificationsForScan({
          userId: scan.userId,
          identityId: scan.identityId.toHexString(),
          scanId,
          newExposureIds: diff.new,
          escalatedExposureIds: diff.escalated,
        });
      } catch (error) {
        logger.error(
          { scanId, err: error instanceof Error ? error.name : "unknown" },
          "creating alerts failed",
        );
      }
    }
    if (summary.new > 0) {
      await recordAuditEvent({
        event: "EXPOSURE_DETECTED",
        outcome: "success",
        userId: scan.userId,
        metadata: {
          identityId: scan.identityId.toHexString(),
          scanId,
          newCount: summary.new,
          changedCount: summary.changed,
        },
      });
    }
  } catch (error) {
    logger.error(
      { scanId, state, err: error instanceof Error ? error.name : "unknown" },
      "scan failed unexpectedly",
    );
    await fail(scan, state, "internal", null);
  }
}

/* ---------------- views ---------------- */

export interface ScanView {
  id: string;
  identityId: string;
  trigger: ScanTrigger;
  state: ScanState;
  failureReason: ScanFailureReason | null;
  providers: Array<{
    name: string;
    displayName: string;
    state: "pending" | "ok" | "error" | "skipped";
    errorCategory: string | null;
    count: number;
    isDemo: boolean;
  }>;
  summary: {
    new: number;
    changed: number;
    existing: number;
    noLongerReported: number;
    activeBySeverity: Record<ExposureSeverity, number>;
  };
  isDemo: boolean;
  createdAt: string;
  finishedAt: string | null;
  retryOfScanId: string | null;
}

export function toScanView(scan: ScanRecord): ScanView {
  const all = processorOptions.providers ?? getExposureProviders();
  const displayName = (name: string) =>
    all.find((p) => p.getName() === name)?.getCapabilities().displayName ?? name;
  const severity = (scan.summary?.activeBySeverity ?? {}) as Partial<Record<ExposureSeverity, number>>;
  return {
    id: scan._id.toHexString(),
    identityId: scan.identityId.toHexString(),
    trigger: scan.trigger,
    state: scan.state,
    failureReason: scan.failureReason ?? null,
    providers: scan.providerResults.map((p) => ({
      name: p.provider,
      displayName: displayName(p.provider),
      state: p.state,
      errorCategory: p.errorCategory ?? null,
      count: p.count ?? 0,
      isDemo: Boolean(p.isDemo),
    })),
    summary: {
      new: scan.summary?.new ?? 0,
      changed: scan.summary?.changed ?? 0,
      existing: scan.summary?.existing ?? 0,
      noLongerReported: scan.summary?.noLongerReported ?? 0,
      activeBySeverity: Object.fromEntries(EXPOSURE_SEVERITIES.map((s) => [s, severity[s] ?? 0])) as Record<
        ExposureSeverity,
        number
      >,
    },
    isDemo: scan.providerResults.length > 0 && scan.providerResults.every((p) => p.isDemo),
    createdAt: scan.createdAt.toISOString(),
    finishedAt: scan.finishedAt ? scan.finishedAt.toISOString() : null,
    retryOfScanId: scan.retryOfScanId ? scan.retryOfScanId.toHexString() : null,
  };
}

export async function getScanForUser(userId: string, scanId: string): Promise<ScanView | null> {
  const scan = await findScanForUser(userId, scanId);
  return scan ? toScanView(scan) : null;
}

export async function getLatestScan(userId: string, identityId: string): Promise<ScanView | null> {
  const _id = parseObjectId(identityId);
  if (!_id) return null;
  const scan = await latestScanForIdentity(userId, _id);
  return scan ? toScanView(scan) : null;
}

/** Seconds until a manual scan is allowed again for this identity (0 = now). */
export async function manualScanAvailableIn(
  userId: string,
  identityId: string,
  now = new Date(),
): Promise<number> {
  const _id = parseObjectId(identityId);
  if (!_id) return 0;
  const recent = await latestCountedManualScan(
    userId,
    _id,
    new Date(now.getTime() - MANUAL_SCAN_COOLDOWN_MS),
  );
  if (!recent) return 0;
  return Math.max(
    0,
    Math.ceil((recent.createdAt.getTime() + MANUAL_SCAN_COOLDOWN_MS - now.getTime()) / 1000),
  );
}
