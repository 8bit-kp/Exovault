import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Ownership-verification code for one identity (spec Part 6 #2). At most one
 * document per identity: a resend replaces the code and resets attempts, all
 * in one atomic upsert. The code is stored only as a keyed HMAC bound to the
 * identity ID.
 */
export const IDENTITY_CODE_TTL_SECONDS = 15 * 60;
export const IDENTITY_CODE_MAX_ATTEMPTS = 5;

const identityVerificationSchema = new Schema(
  {
    identityId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: String, required: true },
    codeHash: { type: String, required: true, match: /^[0-9a-f]{64}$/ },
    attempts: { type: Number, required: true, default: 0, min: 0 },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { collection: "identityVerifications", strict: "throw", timestamps: true },
);

identityVerificationSchema.index({ identityId: 1 }, { unique: true });
// Expired codes are deleted by MongoDB.
identityVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type IdentityVerificationDoc = InferSchemaType<typeof identityVerificationSchema>;

export const IdentityVerification: Model<IdentityVerificationDoc> =
  (mongoose.models.IdentityVerification as Model<IdentityVerificationDoc> | undefined) ??
  mongoose.model<IdentityVerificationDoc>("IdentityVerification", identityVerificationSchema);
