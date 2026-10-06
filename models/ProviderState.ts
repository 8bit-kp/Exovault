import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/** Health and circuit-breaker state per provider (spec 7.2). Shared by every scan and worker. */
const providerStateSchema = new Schema(
  {
    provider: { type: String, required: true },
    health: { type: String, enum: ["healthy", "degraded", "down"], required: true, default: "healthy" },
    consecutiveFailures: { type: Number, required: true, default: 0, min: 0 },
    lastSuccessAt: { type: Date, default: null },
    lastFailureAt: { type: Date, default: null },
    lastErrorCategory: { type: String, default: null },
    /** While in the future, the circuit is open and the provider is skipped. */
    cooldownUntil: { type: Date, default: null },
  },
  { collection: "providerStates", strict: "throw", timestamps: true },
);

providerStateSchema.index({ provider: 1 }, { unique: true });

export type ProviderStateDoc = InferSchemaType<typeof providerStateSchema>;

export const ProviderState: Model<ProviderStateDoc> =
  (mongoose.models.ProviderState as Model<ProviderStateDoc> | undefined) ??
  mongoose.model<ProviderStateDoc>("ProviderState", providerStateSchema);
