import "server-only";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db/mongoose";
import type { AuditEvent } from "@/lib/domain/audit";
import { AuditLog } from "@/models/AuditLog";
import type { SecurityEventKind } from "@/components/dashboard/security-event";

/**
 * "Recent activity" (spec 13.5) is a user-facing projection of the audit log:
 * only the user's own security-relevant events, described from IDs and
 * counts. Audit rows never hold identifiers, so neither does this.
 */
export interface ActivityItem {
  id: string;
  kind: SecurityEventKind;
  at: string;
  detail: string;
}

const SHOWN: AuditEvent[] = [
  "SCAN_COMPLETED",
  "SCAN_FAILED",
  "EXPOSURE_DETECTED",
  "IDENTITY_VERIFIED",
  "MONITORING_ENABLED",
  "MONITORING_DISABLED",
  "NOTIFICATION_SENT",
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export async function listRecentActivity(userId: string, limit = 8): Promise<ActivityItem[]> {
  await connectToDatabase();
  const rows = await AuditLog.find({
    userId,
    event: mongoose.trusted({ $in: SHOWN }),
    outcome: mongoose.trusted({ $ne: "failure" }),
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return rows.flatMap<ActivityItem>((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const base = { id: String(row._id), at: (row as { createdAt: Date }).createdAt.toISOString() };
    switch (row.event) {
      case "SCAN_COMPLETED": {
        const partial = meta.outcome === "partial";
        const found =
          typeof meta.new === "number" && meta.new > 0
            ? `${plural(meta.new, "new exposure")} found`
            : "No new exposures";
        return [
          {
            ...base,
            kind: partial ? "scan_partial" : "scan_completed",
            detail: partial ? `${found}. Some sources didn't respond.` : `${found}.`,
          },
        ];
      }
      case "SCAN_FAILED":
        return [
          {
            ...base,
            kind: "scan_failed",
            detail: "No sources could be checked. Your results didn't change.",
          },
        ];
      case "EXPOSURE_DETECTED":
        return [
          {
            ...base,
            kind: "exposure_detected",
            detail: `${plural(Number(meta.newCount ?? 0), "new exposure")} recorded.`,
          },
        ];
      case "IDENTITY_VERIFIED":
        return [
          {
            ...base,
            kind: "identity_verified",
            detail:
              meta.method === "account-email"
                ? "Your sign-in address was added."
                : "Ownership confirmed with an emailed code.",
          },
        ];
      case "MONITORING_ENABLED":
      case "MONITORING_DISABLED":
        return [
          {
            ...base,
            kind: "monitoring_changed",
            detail: row.event === "MONITORING_ENABLED" ? "Monitoring turned on." : "Monitoring turned off.",
          },
        ];
      case "NOTIFICATION_SENT":
        return [{ ...base, kind: "notification_sent", detail: "An alert was emailed to you." }];
      default:
        return [];
    }
  });
}
