import "server-only";
import { RATE_LIMITS } from "@/config/rate-limits";
import { brand } from "@/config/brand";
import { recordAuditEvent } from "@/lib/audit";
import { decryptField } from "@/lib/crypto/field-encryption";
import { connectToDatabase } from "@/lib/db/mongoose";
import { limit, RateLimitUnavailableError } from "@/lib/rate-limit";
import { AuditLog } from "@/models/AuditLog";
import { Exposure } from "@/models/Exposure";
import { Identity } from "@/models/Identity";
import { Notification } from "@/models/Notification";
import { RemediationAction } from "@/models/RemediationAction";
import { RiskScore } from "@/models/RiskScore";
import { Scan } from "@/models/Scan";
import { identityAad } from "@/server/services/identity/identity-service";
import { getPreferences } from "@/server/services/notification/notification-service";

/**
 * Data export (spec 5.2): everything we hold about the user, as JSON.
 *
 * It contains the user's own data in clear, including the identifiers they
 * monitor (decrypted for this response only) and sensitive source names: it's
 * their data, downloaded inside their authenticated session. It never contains
 * our internals: ciphertext, blind indexes, fingerprints, code hashes, dedupe
 * keys, or audit hashes of IPs and subjects. Every field is listed explicitly,
 * so a new model field can't leak into exports by accident.
 */

export const EXPORT_FORMAT = "exovault-export/1";

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);
const id = (value: { toString(): string } | null | undefined) => (value ? value.toString() : null);

export type ExportResult =
  { ok: true; filename: string; body: string } | { ok: false; reason: "rate_limited" | "unavailable" };

export async function exportAccountData(
  user: { id: string; email: string; createdAt: Date },
  ctx: { requestId: string | null },
  now = new Date(),
): Promise<ExportResult> {
  try {
    if (!(await limit(RATE_LIMITS.dataExportPerUser, user.id)).allowed)
      return { ok: false, reason: "rate_limited" };
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) return { ok: false, reason: "unavailable" };
    throw error;
  }
  const data = await buildAccountExport(user, now);
  await recordAuditEvent({
    event: "DATA_EXPORTED",
    outcome: "success",
    userId: user.id,
    requestId: ctx.requestId,
    metadata: { format: EXPORT_FORMAT },
  });
  return {
    ok: true,
    filename: `${brand.name.toLowerCase()}-export-${now.toISOString().slice(0, 10)}.json`,
    body: JSON.stringify(data, null, 2),
  };
}

export async function buildAccountExport(
  user: { id: string; email: string; createdAt: Date },
  now = new Date(),
) {
  await connectToDatabase();
  const userId = user.id;
  const [identities, exposures, remediation, scans, riskScores, notifications, preferences, audit] =
    await Promise.all([
      Identity.find({ userId }).sort({ createdAt: 1 }).lean(),
      Exposure.find({ userId }).sort({ firstSeenAt: 1 }).lean(),
      RemediationAction.find({ userId }).lean(),
      Scan.find({ userId }).sort({ createdAt: 1 }).lean(),
      RiskScore.find({ userId }).sort({ computedAt: 1 }).lean(),
      Notification.find({ userId }).sort({ createdAt: 1 }).lean(),
      getPreferences(userId),
      AuditLog.find({ userId }).sort({ createdAt: 1 }).lean(),
    ]);

  const stepsByExposure = new Map<string, Array<{ step: string; completedAt: string | null }>>();
  for (const action of remediation) {
    const key = action.exposureId.toString();
    stepsByExposure.set(key, [
      ...(stepsByExposure.get(key) ?? []),
      { step: action.actionKey, completedAt: iso(action.completedAt) },
    ]);
  }

  return {
    format: EXPORT_FORMAT,
    exportedAt: now.toISOString(),
    product: brand.name,
    note: "Everything this account holds. Provider responses are never stored, so they can't be exported.",
    account: { email: user.email, createdAt: iso(user.createdAt) },
    identities: identities.map((identity) => ({
      id: id(identity._id),
      type: identity.type,
      value: decryptField(identity.valueEncrypted, identityAad(identity._id)),
      verificationStatus: identity.verificationStatus,
      verifiedAt: iso(identity.verifiedAt),
      monitoring: {
        enabled: Boolean(identity.monitoring?.enabled),
        frequency: identity.monitoring?.frequency ?? null,
        nextScanAt: iso(identity.monitoring?.nextScanAt),
      },
      lastScanAt: iso(identity.lastScanAt),
      createdAt: iso(identity.createdAt),
    })),
    exposures: exposures.map((exposure) => ({
      id: id(exposure._id),
      identityId: id(exposure.identityId),
      source: exposure.sourceName,
      sourceType: exposure.sourceType,
      sensitiveSource: exposure.isSensitiveSource,
      breachDate: iso(exposure.breachDate),
      exposedData: exposure.exposedDataTypes,
      severity: exposure.severity,
      severityReason: exposure.severityReason,
      reportedBy: exposure.providers,
      evidence: exposure.evidenceReferences,
      status: exposure.remediationState,
      dismissReason: exposure.dismissReason ?? null,
      completedSteps: stepsByExposure.get(exposure._id.toString()) ?? [],
      firstSeenAt: iso(exposure.firstSeenAt),
      lastSeenAt: iso(exposure.lastSeenAt),
      demoData: exposure.isDemo,
    })),
    scans: scans.map((scan) => ({
      id: id(scan._id),
      identityId: id(scan.identityId),
      trigger: scan.trigger,
      state: scan.state,
      failureReason: scan.failureReason ?? null,
      providers: (scan.providerResults ?? []).map((result) => ({
        provider: result.provider,
        state: result.state,
        errorCategory: result.errorCategory ?? null,
        found: result.count ?? 0,
      })),
      summary: scan.summary
        ? {
            new: scan.summary.new,
            changed: scan.summary.changed,
            existing: scan.summary.existing,
            noLongerReported: scan.summary.noLongerReported,
          }
        : null,
      createdAt: iso(scan.createdAt),
      finishedAt: iso(scan.finishedAt),
    })),
    riskScores: riskScores.map((score) => ({
      score: score.score,
      band: score.band,
      methodologyVersion: score.methodologyVersion,
      reason: score.reason,
      factors: (score.factors ?? []).map((factor) => ({
        label: factor.label,
        points: factor.points,
        detail: factor.detail,
      })),
      computedAt: iso(score.computedAt),
    })),
    notifications: notifications.map((notification) => ({
      id: id(notification._id),
      exposureId: id(notification.exposureId),
      channel: notification.channel,
      kind: notification.kind,
      severity: notification.severity,
      status: notification.status,
      sentAt: iso(notification.sentAt),
      readAt: iso(notification.readAt),
      createdAt: iso(notification.createdAt),
    })),
    notificationPreferences: preferences,
    securityLog: audit.map((entry) => ({
      event: entry.event,
      outcome: entry.outcome,
      at: iso(entry.createdAt),
      details: entry.metadata ?? null,
    })),
  };
}
