import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { EXPOSED_DATA_TYPES, EXPOSURE_SOURCE_TYPES } from "@/lib/domain/exposure";

/**
 * Global catalog of known sources/incidents (spec 14.1). Shared across users,
 * holds no personal data. One row per (normalized source, incident day).
 * Provider HTML descriptions are never stored (XSS and licence hygiene).
 */
const providerRefSchema = new Schema(
  { provider: { type: String, required: true }, reference: { type: String, required: true, maxlength: 200 } },
  { _id: false, strict: "throw" },
);

const breachSchema = new Schema(
  {
    catalogKey: { type: String, required: true }, // `${sourceKey}:${YYYY-MM-DD | unknown}`
    sourceKey: { type: String, required: true },
    displayName: { type: String, required: true, maxlength: 300 },
    sourceType: { type: String, enum: EXPOSURE_SOURCE_TYPES, required: true },
    breachDate: { type: Date, default: null },
    dataTypes: { type: [{ type: String, enum: EXPOSED_DATA_TYPES }], default: [] },
    isSensitive: { type: Boolean, required: true, default: false },
    // Bounded by the number of providers.
    providerRefs: { type: [providerRefSchema], default: [], validate: (v: unknown[]) => v.length <= 20 },
    evidenceReferences: { type: [String], default: [], validate: (v: unknown[]) => v.length <= 20 },
    /** Came from a demo/mock provider: the UI must label it "Demo data". */
    isDemo: { type: Boolean, required: true, default: false },
  },
  { collection: "breaches", strict: "throw", timestamps: true },
);

breachSchema.index({ catalogKey: 1 }, { unique: true });
breachSchema.index({ sourceKey: 1 });

export type BreachDoc = InferSchemaType<typeof breachSchema>;

export const Breach: Model<BreachDoc> =
  (mongoose.models.Breach as Model<BreachDoc> | undefined) ??
  mongoose.model<BreachDoc>("Breach", breachSchema);
