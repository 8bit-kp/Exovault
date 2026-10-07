import { Types } from "mongoose";
import { connectToDatabase } from "@/lib/db/mongoose";
import type { RiskBand } from "@/lib/domain/risk";
import { Exposure } from "@/models/Exposure";
import { RiskScore } from "@/models/RiskScore";
import { calculateRiskScore, type RiskFactor } from "./risk-score";

export interface RiskSnapshotView {
  score: number;
  band: RiskBand;
  factors: RiskFactor[];
  methodologyVersion: string;
  computedAt: string;
}

/**
 * Recomputes the user's score from all their exposures (every identity) and
 * stores a snapshot. Called by the scan's scoring step, and later by
 * remediation changes.
 */
export async function recomputeRiskScore(
  userId: string,
  reason: "scan" | "remediation" | "identity_removed",
  options: { scanId?: string; now?: Date } = {},
): Promise<RiskSnapshotView> {
  await connectToDatabase();
  const now = options.now ?? new Date();
  const rows = await Exposure.find(
    { userId },
    {
      severity: 1,
      exposedDataTypes: 1,
      sourceType: 1,
      breachDate: 1,
      firstSeenAt: 1,
      detectionState: 1,
      remediationState: 1,
    },
  )
    .limit(5_000)
    .lean();
  const result = calculateRiskScore({
    now,
    exposures: rows.map((r) => ({
      severity: r.severity,
      dataTypes: r.exposedDataTypes,
      sourceType: r.sourceType,
      breachDate: r.breachDate ?? null,
      firstSeenAt: r.firstSeenAt,
      detectionState: r.detectionState,
      remediationState: r.remediationState,
    })),
  });
  await RiskScore.create({
    userId,
    score: result.score,
    band: result.band,
    factors: result.factors,
    methodologyVersion: result.methodologyVersion,
    exposureCount: rows.length,
    reason,
    scanId: options.scanId ? new Types.ObjectId(options.scanId) : null,
    computedAt: now,
  });
  return { ...result, computedAt: now.toISOString() };
}

/** Latest snapshot and the one before it (for "up/down since last scan"). */
export async function getRiskScores(
  userId: string,
): Promise<{ current: RiskSnapshotView | null; previous: RiskSnapshotView | null }> {
  await connectToDatabase();
  const [current, previous] = await RiskScore.find({ userId }).sort({ computedAt: -1 }).limit(2).lean();
  const view = (doc: typeof current | undefined): RiskSnapshotView | null =>
    doc
      ? {
          score: doc.score,
          band: doc.band,
          factors: doc.factors.map((f) => ({
            key: f.key as RiskFactor["key"],
            label: f.label,
            points: f.points,
            detail: f.detail,
          })),
          methodologyVersion: doc.methodologyVersion,
          computedAt: doc.computedAt.toISOString(),
        }
      : null;
  return { current: view(current), previous: view(previous) };
}
