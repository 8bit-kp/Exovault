import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { EXPOSURE_SEVERITIES, SCAN_STATES } from "@/lib/domain/exposure";
import { SCAN_FAILURE_REASONS, SCAN_TRIGGERS } from "@/lib/domain/scan";

/** Scan records are kept 12 months (spec 5.2). */
export const SCAN_RETENTION_SECONDS = 365 * 24 * 60 * 60;

const providerResultSchema = new Schema(
  {
    provider: { type: String, required: true },
    state: { type: String, enum: ["pending", "ok", "error", "skipped"], required: true },
    errorCategory: { type: String, default: null },
    attempts: { type: Number, default: 0 },
    count: { type: Number, default: 0 },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
    isDemo: { type: Boolean, default: false },
  },
  { _id: false, strict: "throw" },
);

const stateHistorySchema = new Schema(
  { state: { type: String, enum: SCAN_STATES, required: true }, at: { type: Date, required: true } },
  { _id: false, strict: "throw" },
);

const summarySchema = new Schema(
  {
    new: { type: Number, default: 0 },
    changed: { type: Number, default: 0 },
    existing: { type: Number, default: 0 },
    noLongerReported: { type: Number, default: 0 },
    /** Active exposures by severity for this identity after the scan (spec 7.7 "active"). */
    activeBySeverity: {
      type: new Schema(
        Object.fromEntries(EXPOSURE_SEVERITIES.map((s) => [s, { type: Number, default: 0 }])),
        {
          _id: false,
          strict: "throw",
        },
      ),
      default: () => ({}),
    },
  },
  { _id: false, strict: "throw" },
);

/**
 * One scan of one identity (spec Part 8, 14.1). Per-provider results and the
 * state history are embedded (bounded by provider count and state count).
 */
const scanSchema = new Schema(
  {
    userId: { type: String, required: true },
    identityId: { type: Schema.Types.ObjectId, required: true },
    trigger: { type: String, enum: SCAN_TRIGGERS, required: true },
    retryOfScanId: { type: Schema.Types.ObjectId, default: null },
    state: { type: String, enum: SCAN_STATES, required: true, default: "queued" },
    /**
     * Present (true) only while the scan is not terminal. The unique partial
     * index on it makes "one active scan per identity" a database guarantee.
     */
    active: { type: Boolean, default: undefined },
    stateHistory: { type: [stateHistorySchema], default: [], validate: (v: unknown[]) => v.length <= 12 },
    providerResults: {
      type: [providerResultSchema],
      default: [],
      validate: (v: unknown[]) => v.length <= 20,
    },
    summary: { type: summarySchema, default: () => ({}) },
    failureReason: { type: String, enum: [...SCAN_FAILURE_REASONS, null], default: null },
    lastProgressAt: { type: Date, required: true },
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { collection: "scans", strict: "throw", timestamps: true },
);

// One active scan per identity, enforced by MongoDB (spec Part 8 idempotency).
scanSchema.index(
  { identityId: 1 },
  { unique: true, partialFilterExpression: { active: true }, name: "one_active_scan_per_identity" },
);
// Cooldown check and per-identity history.
scanSchema.index({ identityId: 1, trigger: 1, createdAt: -1 });
// A user's scan history.
scanSchema.index({ userId: 1, createdAt: -1 });
// 12-month retention.
scanSchema.index({ createdAt: 1 }, { expireAfterSeconds: SCAN_RETENTION_SECONDS });

export type ScanDoc = InferSchemaType<typeof scanSchema>;

export const Scan: Model<ScanDoc> =
  (mongoose.models.Scan as Model<ScanDoc> | undefined) ?? mongoose.model<ScanDoc>("Scan", scanSchema);
