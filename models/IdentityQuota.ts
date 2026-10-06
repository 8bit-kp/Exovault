import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Per-user count of active identities. The identity limit is enforced by a
 * conditional `$inc` on this single document (D-024): without transactions
 * (D-004), "count, then insert" would let two concurrent requests both pass.
 */
const identityQuotaSchema = new Schema(
  {
    userId: { type: String, required: true },
    active: { type: Number, required: true, default: 0, min: 0 },
  },
  { collection: "identityQuotas", strict: "throw", timestamps: true },
);

identityQuotaSchema.index({ userId: 1 }, { unique: true });

export type IdentityQuotaDoc = InferSchemaType<typeof identityQuotaSchema>;

export const IdentityQuota: Model<IdentityQuotaDoc> =
  (mongoose.models.IdentityQuota as Model<IdentityQuotaDoc> | undefined) ??
  mongoose.model<IdentityQuotaDoc>("IdentityQuota", identityQuotaSchema);
