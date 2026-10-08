import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const ACCOUNT_DELETION_STATES = ["scheduled", "purging"] as const;

/**
 * A pending account deletion (spec 5.2): one row per user, from the request
 * until the purge finishes, then the row itself is deleted.
 *
 * `emailEncrypted` (AES-256-GCM, AAD = `account-deletion:<userId>`) lets the
 * purge send the completion email after the user record is gone. It is the
 * only copy of the address that outlives the purge, and only until that email
 * is sent.
 *
 * The purge is resumable without transactions (D-037): a worker claims a row
 * by moving it to `purging` with `claimedAt`; every purge step is an
 * idempotent delete, and a stale claim is taken over by the next run.
 */
const encryptedValueSchema = new Schema(
  {
    v: { type: Number, enum: [1], required: true },
    keyId: { type: String, required: true },
    iv: { type: String, required: true },
    ciphertext: { type: String, required: true },
    tag: { type: String, required: true },
  },
  { _id: false, strict: "throw" },
);

const accountDeletionSchema = new Schema(
  {
    userId: { type: String, required: true },
    state: { type: String, enum: ACCOUNT_DELETION_STATES, required: true, default: "scheduled" },
    requestedAt: { type: Date, required: true },
    purgeAfter: { type: Date, required: true },
    claimedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    emailEncrypted: { type: encryptedValueSchema, required: true },
  },
  { collection: "accountDeletions", strict: "throw", timestamps: true },
);

// One pending deletion per user; also the lookup for "is this account being deleted?" on every request.
accountDeletionSchema.index({ userId: 1 }, { unique: true });
// The purge job's scan for due and stale rows.
accountDeletionSchema.index({ state: 1, purgeAfter: 1 });

export type AccountDeletionDoc = InferSchemaType<typeof accountDeletionSchema>;

export const AccountDeletion: Model<AccountDeletionDoc> =
  (mongoose.models.AccountDeletion as Model<AccountDeletionDoc> | undefined) ??
  mongoose.model<AccountDeletionDoc>("AccountDeletion", accountDeletionSchema);
