import mongoose, { Types } from "mongoose";
import { connectToDatabase } from "@/lib/db/mongoose";
import type { ScanState } from "@/lib/domain/exposure";
import {
  canTransition,
  isTerminalScanState,
  type ScanFailureReason,
  type ScanTrigger,
} from "@/lib/domain/scan";
import { Scan, type ScanDoc } from "@/models/Scan";
import type { ProviderRunResult } from "@/server/services/exposure/engine";

/**
 * Scan persistence. Reads for users are scoped by `userId`; state changes are
 * compare-and-set on the current state (D-004), so two processors can't both
 * advance one scan.
 */
export type ScanRecord = ScanDoc & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };

function objectId(id: string): Types.ObjectId | null {
  return Types.ObjectId.isValid(id) && new Types.ObjectId(id).toHexString() === id
    ? new Types.ObjectId(id)
    : null;
}

export class ActiveScanExistsError extends Error {
  constructor() {
    super("An active scan already exists for this identity");
    this.name = "ActiveScanExistsError";
  }
}

export async function insertScan(input: {
  userId: string;
  identityId: Types.ObjectId;
  trigger: ScanTrigger;
  providers: Array<{ name: string; isDemo: boolean }>;
  retryOfScanId?: Types.ObjectId | null;
  now?: Date;
}): Promise<ScanRecord> {
  await connectToDatabase();
  const now = input.now ?? new Date();
  try {
    const doc = await Scan.create({
      userId: input.userId,
      identityId: input.identityId,
      trigger: input.trigger,
      retryOfScanId: input.retryOfScanId ?? null,
      state: "queued",
      active: true,
      stateHistory: [{ state: "queued", at: now }],
      providerResults: input.providers.map((p) => ({ provider: p.name, state: "pending", isDemo: p.isDemo })),
      lastProgressAt: now,
    });
    return doc.toObject() as ScanRecord;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new ActiveScanExistsError();
    throw error;
  }
}

export async function findScanById(scanId: Types.ObjectId): Promise<ScanRecord | null> {
  await connectToDatabase();
  return Scan.findById(scanId).lean<ScanRecord>();
}

export async function findScanForUser(userId: string, scanId: string): Promise<ScanRecord | null> {
  const _id = objectId(scanId);
  if (!_id) return null;
  await connectToDatabase();
  return Scan.findOne({ _id, userId }).lean<ScanRecord>();
}

export async function findActiveScanForIdentity(identityId: Types.ObjectId): Promise<ScanRecord | null> {
  await connectToDatabase();
  return Scan.findOne({ identityId, active: true }).lean<ScanRecord>();
}

export async function latestScanForIdentity(
  userId: string,
  identityId: Types.ObjectId,
): Promise<ScanRecord | null> {
  await connectToDatabase();
  return Scan.findOne({ userId, identityId }).sort({ createdAt: -1 }).lean<ScanRecord>();
}

/** Most recent manual scan that counts toward the cooldown (failed scans don't). */
export async function latestCountedManualScan(
  identityId: Types.ObjectId,
  since: Date,
): Promise<ScanRecord | null> {
  await connectToDatabase();
  return Scan.findOne({
    identityId,
    trigger: "manual",
    state: mongoose.trusted({ $ne: "failed" }),
    createdAt: mongoose.trusted({ $gte: since }),
  })
    .sort({ createdAt: -1 })
    .lean<ScanRecord>();
}

/**
 * Advance `from` → `to` only if the scan is still in `from`. Terminal states
 * release the per-identity lock (unset `active`).
 */
export async function transitionScan(
  scanId: Types.ObjectId,
  from: ScanState,
  to: ScanState,
  extra: { failureReason?: ScanFailureReason; summary?: ScanDoc["summary"] } = {},
  now = new Date(),
): Promise<boolean> {
  if (!canTransition(from, to)) throw new Error(`Illegal scan transition ${from} → ${to}`);
  await connectToDatabase();
  const terminal = isTerminalScanState(to);
  const result = await Scan.updateOne(
    { _id: scanId, state: from },
    {
      $set: {
        state: to,
        lastProgressAt: now,
        ...(from === "queued" ? { startedAt: now } : {}),
        ...(terminal ? { finishedAt: now } : {}),
        ...(extra.failureReason ? { failureReason: extra.failureReason } : {}),
        ...(extra.summary ? { summary: extra.summary } : {}),
      },
      ...(terminal ? { $unset: { active: "" } } : {}),
      $push: { stateHistory: { state: to, at: now } },
    },
  );
  return result.modifiedCount === 1;
}

/** Records one provider's settled result on a running scan (live progress). */
export async function recordScanProviderResult(
  scanId: Types.ObjectId,
  result: ProviderRunResult,
): Promise<void> {
  await connectToDatabase();
  await Scan.updateOne(
    { _id: scanId, "providerResults.provider": result.provider },
    {
      $set: {
        "providerResults.$.state": result.state,
        "providerResults.$.errorCategory": result.errorCategory ?? null,
        "providerResults.$.attempts": result.attempts,
        "providerResults.$.count": result.count,
        "providerResults.$.startedAt": result.startedAt,
        "providerResults.$.finishedAt": result.finishedAt,
        lastProgressAt: result.finishedAt,
      },
    },
  );
}

/**
 * Scans whose process died (restart, crash) never reach a terminal state and
 * would hold the identity's lock forever. Any active scan with no progress
 * for `staleBefore` is failed as "interrupted", releasing the lock.
 */
export async function failStaleScans(
  identityId: Types.ObjectId,
  staleBefore: Date,
  now = new Date(),
): Promise<number> {
  await connectToDatabase();
  const result = await Scan.updateMany(
    { identityId, active: true, lastProgressAt: mongoose.trusted({ $lt: staleBefore }) },
    {
      $set: { state: "failed", failureReason: "interrupted", finishedAt: now, lastProgressAt: now },
      $unset: { active: "" },
      $push: { stateHistory: { state: "failed", at: now } },
    },
  );
  return result.modifiedCount;
}
