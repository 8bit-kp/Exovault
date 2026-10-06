import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { IDENTIFIER_TYPES } from "@/lib/domain/exposure";
import { IDENTITY_STATUSES, IDENTITY_VERIFICATION_STATES } from "@/lib/domain/identifier";

/**
 * A monitored identifier (spec 5.1, 14.1). Multi-identity and multi-type from
 * day one; the product limits it to one active email by default.
 *
 * The plaintext value is never stored: `valueEncrypted` (AES-256-GCM, AAD =
 * `identity:<_id>`), `valueBlindIndex` (keyed HMAC of the normalized value),
 * `valueMasked` (display only).
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

const monitoringSchema = new Schema(
  {
    // M1: always off (manual scans only). M2 adds scheduling.
    enabled: { type: Boolean, default: false },
    frequency: { type: String, enum: ["6h", "12h", "24h", null], default: null },
    nextScanAt: { type: Date, default: null },
  },
  { _id: false, strict: "throw" },
);

const identitySchema = new Schema(
  {
    userId: { type: String, required: true },
    type: { type: String, enum: IDENTIFIER_TYPES, required: true },
    valueEncrypted: { type: encryptedValueSchema, required: true },
    valueBlindIndex: { type: String, required: true, match: /^[0-9a-f]{64}$/ },
    valueMasked: { type: String, required: true, maxlength: 300 },
    verificationStatus: {
      type: String,
      enum: IDENTITY_VERIFICATION_STATES,
      required: true,
      default: "pending",
    },
    verifiedAt: { type: Date, default: null },
    /** "account-email" when it matched the verified sign-in email; "code" when proven by OTP. */
    verificationMethod: { type: String, enum: ["account-email", "code", null], default: null },
    status: { type: String, enum: IDENTITY_STATUSES, required: true, default: "active" },
    monitoring: { type: monitoringSchema, default: () => ({}) },
    lastScanAt: { type: Date, default: null },
  },
  { collection: "identities", strict: "throw", timestamps: true },
);

// A user's identities, filtered by status (list page, limit check).
identitySchema.index({ userId: 1, status: 1, createdAt: -1 });
// A user can't add the same identifier twice while it's active. Partial: deleted rows don't block re-adding.
identitySchema.index(
  { userId: 1, type: 1, valueBlindIndex: 1 },
  { unique: true, partialFilterExpression: { status: "active" }, name: "active_identifier_unique_per_user" },
);
// M2 scheduler sweep (declared now so the shape is stable).
identitySchema.index({ "monitoring.enabled": 1, "monitoring.nextScanAt": 1 });

export type IdentityDoc = InferSchemaType<typeof identitySchema>;

export const Identity: Model<IdentityDoc> =
  (mongoose.models.Identity as Model<IdentityDoc> | undefined) ??
  mongoose.model<IdentityDoc>("Identity", identitySchema);
