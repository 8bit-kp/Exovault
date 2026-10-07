import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Binds email verification to the sign-up (or password sign-in) that set the
 * account's password (D-034). Only the browser holding the matching nonce can
 * verify with an emailed code, so a code can't verify an account someone else
 * created with their own password (pre-account hijacking).
 */
const pendingSignupSchema = new Schema(
  {
    userId: { type: String, required: true },
    nonceHash: { type: String, required: true, match: /^[0-9a-f]{64}$/ },
    expiresAt: { type: Date, required: true },
  },
  { collection: "pendingSignups", strict: "throw", timestamps: true },
);

pendingSignupSchema.index({ userId: 1 }, { unique: true });
pendingSignupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type PendingSignupDoc = InferSchemaType<typeof pendingSignupSchema>;

export const PendingSignup: Model<PendingSignupDoc> =
  (mongoose.models.PendingSignup as Model<PendingSignupDoc> | undefined) ??
  mongoose.model<PendingSignupDoc>("PendingSignup", pendingSignupSchema);
