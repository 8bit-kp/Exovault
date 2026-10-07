import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { EXPOSURE_SEVERITIES } from "@/lib/domain/exposure";
import { DELIVERY_MODES, HHMM, isValidTimeZone } from "@/lib/domain/notifications";

/** Per-user alert preferences (spec Part 10). Absent document = defaults. */
const notificationPreferenceSchema = new Schema(
  {
    userId: { type: String, required: true },
    emailEnabled: { type: Boolean, required: true, default: true },
    minSeverity: { type: String, enum: EXPOSURE_SEVERITIES, required: true, default: "medium" },
    mode: { type: String, enum: DELIVERY_MODES, required: true, default: "immediate" },
    quietHours: {
      type: new Schema(
        {
          enabled: { type: Boolean, default: false },
          start: { type: String, default: "22:00", match: HHMM },
          end: { type: String, default: "07:00", match: HHMM },
        },
        { _id: false, strict: "throw" },
      ),
      default: () => ({}),
    },
    timezone: {
      type: String,
      required: true,
      default: "UTC",
      validate: { validator: isValidTimeZone, message: "invalid timezone" },
    },
  },
  { collection: "notificationPreferences", strict: "throw", timestamps: true },
);

notificationPreferenceSchema.index({ userId: 1 }, { unique: true });

export type NotificationPreferenceDoc = InferSchemaType<typeof notificationPreferenceSchema>;

export const NotificationPreference: Model<NotificationPreferenceDoc> =
  (mongoose.models.NotificationPreference as Model<NotificationPreferenceDoc> | undefined) ??
  mongoose.model<NotificationPreferenceDoc>("NotificationPreference", notificationPreferenceSchema);
