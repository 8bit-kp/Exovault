import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { CHECKLIST_KEYS } from "@/lib/domain/remediation";

/**
 * One completed checklist item (spec 13.6, 14.1). Presence = done. Unique per
 * (exposure, item), so ticking twice is idempotent. Deleted with the
 * exposure's identity.
 */
const remediationActionSchema = new Schema(
  {
    userId: { type: String, required: true },
    identityId: { type: Schema.Types.ObjectId, required: true },
    exposureId: { type: Schema.Types.ObjectId, required: true },
    actionKey: { type: String, enum: CHECKLIST_KEYS, required: true },
    completedAt: { type: Date, required: true },
  },
  { collection: "remediationActions", strict: "throw", timestamps: false },
);

remediationActionSchema.index({ exposureId: 1, actionKey: 1 }, { unique: true });
remediationActionSchema.index({ identityId: 1 });

export type RemediationActionDoc = InferSchemaType<typeof remediationActionSchema>;

export const RemediationAction: Model<RemediationActionDoc> =
  (mongoose.models.RemediationAction as Model<RemediationActionDoc> | undefined) ??
  mongoose.model<RemediationActionDoc>("RemediationAction", remediationActionSchema);
