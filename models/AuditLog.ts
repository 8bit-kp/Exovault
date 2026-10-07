import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { AUDIT_EVENTS, AUDIT_OUTCOMES } from "@/lib/domain/audit";

/** Twelve months (spec 5.2). */
export const AUDIT_RETENTION_SECONDS = 365 * 24 * 60 * 60;

/**
 * Append-only audit trail (spec 12.5). Holds IDs and keyed hashes only: no
 * emails, tokens, IP addresses or user agents in clear. Application code may
 * insert; update and delete paths throw (the TTL index and the account
 * deletion anonymiser, a later phase, are the only things that change rows).
 */
const auditLogSchema = new Schema(
  {
    event: { type: String, enum: AUDIT_EVENTS, required: true },
    outcome: { type: String, enum: AUDIT_OUTCOMES, required: true },
    /** Better Auth user id, when known. Null for e.g. failed sign-in to an unknown account. */
    userId: { type: String, default: null },
    /** Keyed hash of the subject identifier (e.g. sign-in email) to correlate attempts without storing it. */
    subjectHash: { type: String, default: null },
    /** Keyed hash of the client IP. */
    ipHash: { type: String, default: null },
    requestId: { type: String, default: null, maxlength: 64 },
    /** Small, non-sensitive context, e.g. { reason: "rate_limited", rule: "sign-in:ip" }. */
    metadata: { type: Schema.Types.Mixed, default: undefined },
  },
  {
    collection: "auditLogs",
    strict: "throw",
    timestamps: { createdAt: true, updatedAt: false },
    minimize: true,
  },
);

// Per-user activity feed, newest first.
auditLogSchema.index({ userId: 1, createdAt: -1 });
// Correlate repeated failures for one subject (abuse investigation).
auditLogSchema.index(
  { subjectHash: 1, createdAt: -1 },
  { partialFilterExpression: { subjectHash: { $type: "string" } } },
);
// Retention: MongoDB deletes rows 12 months after creation.
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: AUDIT_RETENTION_SECONDS });

function appendOnly(): never {
  throw new Error("AuditLog is append-only");
}
for (const op of [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "replaceOne",
  "findOneAndReplace",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
] as const) {
  auditLogSchema.pre(op, appendOnly);
}
auditLogSchema.pre("save", function () {
  if (!this.isNew) appendOnly();
});

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema>;

export const AuditLog: Model<AuditLogDoc> =
  (mongoose.models.AuditLog as Model<AuditLogDoc> | undefined) ??
  mongoose.model<AuditLogDoc>("AuditLog", auditLogSchema);
