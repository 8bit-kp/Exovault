import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { EXPOSURE_SEVERITIES } from "@/lib/domain/exposure";
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_KINDS,
  NOTIFICATION_STATUSES,
  SUPPRESSION_REASONS,
} from "@/lib/domain/notifications";

/** Notifications are kept 90 days (spec 5.2). */
export const NOTIFICATION_RETENTION_SECONDS = 90 * 24 * 60 * 60;

/**
 * One alert about one exposure on one channel (spec Part 10). The unique
 * `dedupeKey` makes creation idempotent: the same event can never produce a
 * second notification. Holds IDs and severity only; email content is built
 * at send time and never stored.
 */
const notificationSchema = new Schema(
  {
    userId: { type: String, required: true },
    identityId: { type: Schema.Types.ObjectId, required: true },
    exposureId: { type: Schema.Types.ObjectId, required: true },
    scanId: { type: Schema.Types.ObjectId, default: null },
    channel: { type: String, enum: NOTIFICATION_CHANNELS, required: true },
    kind: { type: String, enum: NOTIFICATION_KINDS, required: true },
    severity: { type: String, enum: EXPOSURE_SEVERITIES, required: true },
    dedupeKey: { type: String, required: true, maxlength: 300 },
    status: { type: String, enum: NOTIFICATION_STATUSES, required: true },
    suppressionReason: { type: String, enum: [...SUPPRESSION_REASONS, null], default: null },
    /** Not before this time (quiet hours / digest slot). */
    scheduledFor: { type: Date, required: true },
    /** Delivered in a digest rather than individually. */
    digest: { type: Boolean, required: true, default: false },
    attempts: { type: Number, required: true, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
  },
  { collection: "notifications", strict: "throw", timestamps: true },
);

// Never notify the same event twice (spec Part 10).
notificationSchema.index({ dedupeKey: 1 }, { unique: true });
// Dispatcher: due, unsent notifications.
notificationSchema.index({ status: 1, scheduledFor: 1 });
// Inbox.
notificationSchema.index({ userId: 1, createdAt: -1 });
// Retention.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: NOTIFICATION_RETENTION_SECONDS });

export type NotificationDoc = InferSchemaType<typeof notificationSchema>;

export const Notification: Model<NotificationDoc> =
  (mongoose.models.Notification as Model<NotificationDoc> | undefined) ??
  mongoose.model<NotificationDoc>("Notification", notificationSchema);
