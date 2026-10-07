import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import {
  DETECTION_STATES,
  EXPOSED_DATA_TYPES,
  EXPOSURE_SEVERITIES,
  EXPOSURE_SOURCE_TYPES,
  REMEDIATION_STATES,
} from "@/lib/domain/exposure";

/**
 * One exposure of one identity (spec 7.3, 7.7, 14.1). Identity → Exposure is
 * referenced (unbounded); data categories and providers are embedded
 * (bounded enums / provider count). Holds no raw breach data and no
 * identifier: only the identity ID.
 */
const providerRefSchema = new Schema(
  { provider: { type: String, required: true }, reference: { type: String, required: true, maxlength: 200 } },
  { _id: false, strict: "throw" },
);

const exposureSchema = new Schema(
  {
    userId: { type: String, required: true },
    identityId: { type: Schema.Types.ObjectId, required: true },
    breachId: { type: Schema.Types.ObjectId, required: true },
    fingerprint: { type: String, required: true, match: /^[0-9a-f]{64}$/ },

    sourceKey: { type: String, required: true },
    sourceName: { type: String, required: true, maxlength: 300 },
    sourceType: { type: String, enum: EXPOSURE_SOURCE_TYPES, required: true },
    breachDate: { type: Date, default: null },
    addedToProviderAt: { type: Date, default: null },
    exposedDataTypes: { type: [{ type: String, enum: EXPOSED_DATA_TYPES }], default: [] },
    isSensitiveSource: { type: Boolean, required: true },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    providers: {
      type: [String],
      required: true,
      validate: (v: unknown[]) => v.length >= 1 && v.length <= 20,
    },
    providerReferences: {
      type: [providerRefSchema],
      default: [],
      validate: (v: unknown[]) => v.length <= 20,
    },
    evidenceReferences: {
      type: [String],
      default: [],
      validate: (v: string[]) => v.length <= 20 && v.every((url) => /^https:\/\/[^\s]{1,490}$/.test(url)),
    },

    severity: { type: String, enum: EXPOSURE_SEVERITIES, required: true },
    severityReason: { type: String, required: true, maxlength: 300 },
    severityMethodologyVersion: { type: String, required: true },

    detectionState: { type: String, enum: DETECTION_STATES, required: true, default: "new" },
    detectionStateChangedAt: { type: Date, required: true },
    remediationState: { type: String, enum: REMEDIATION_STATES, required: true, default: "open" },
    remediationStateChangedAt: { type: Date, default: null },
    dismissReason: { type: String, default: null, maxlength: 500 },

    /** When WE first detected it for this identity. */
    firstSeenAt: { type: Date, required: true },
    /** Last scan in which a provider still reported it. */
    lastSeenAt: { type: Date, required: true },
    isDemo: { type: Boolean, required: true, default: false },
  },
  { collection: "exposures", strict: "throw", timestamps: true },
);

// Idempotent upsert target: one row per incident per identity (spec 7.5).
exposureSchema.index({ identityId: 1, fingerprint: 1 }, { unique: true });
// Matching step: candidates for an incoming report.
exposureSchema.index({ identityId: 1, sourceKey: 1 });
// Dashboard counts and active filters.
exposureSchema.index({ userId: 1, remediationState: 1, severity: 1 });
// Recent exposures / timeline.
exposureSchema.index({ userId: 1, firstSeenAt: -1 });

export type ExposureDoc = InferSchemaType<typeof exposureSchema>;

export const Exposure: Model<ExposureDoc> =
  (mongoose.models.Exposure as Model<ExposureDoc> | undefined) ??
  mongoose.model<ExposureDoc>("Exposure", exposureSchema);
