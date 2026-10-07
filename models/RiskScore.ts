import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { RISK_BANDS } from "@/lib/domain/risk";

/**
 * Exposure Risk Score snapshots (spec Part 9). Each stores its methodology
 * version, so history stays interpretable when weights change. Kept 12 months,
 * like scans (D-030).
 */
export const RISK_SCORE_RETENTION_SECONDS = 365 * 24 * 60 * 60;

const factorSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true, maxlength: 120 },
    points: { type: Number, required: true },
    detail: { type: String, required: true, maxlength: 400 },
  },
  { _id: false, strict: "throw" },
);

const riskScoreSchema = new Schema(
  {
    userId: { type: String, required: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    band: { type: String, enum: RISK_BANDS, required: true },
    factors: { type: [factorSchema], default: [], validate: (v: unknown[]) => v.length <= 20 },
    methodologyVersion: { type: String, required: true },
    exposureCount: { type: Number, required: true, min: 0 },
    reason: { type: String, enum: ["scan", "remediation", "identity_removed"], required: true },
    scanId: { type: Schema.Types.ObjectId, default: null },
    computedAt: { type: Date, required: true },
  },
  { collection: "riskScores", strict: "throw", timestamps: false },
);

// Latest score and history for a user.
riskScoreSchema.index({ userId: 1, computedAt: -1 });
riskScoreSchema.index({ computedAt: 1 }, { expireAfterSeconds: RISK_SCORE_RETENTION_SECONDS });

export type RiskScoreDoc = InferSchemaType<typeof riskScoreSchema>;

export const RiskScore: Model<RiskScoreDoc> =
  (mongoose.models.RiskScore as Model<RiskScoreDoc> | undefined) ??
  mongoose.model<RiskScoreDoc>("RiskScore", riskScoreSchema);
