import "server-only";
import { Types } from "mongoose";
import type { ExposureView } from "@/components/exposure/types";
import { connectToDatabase } from "@/lib/db/mongoose";
import { EXPOSURE_SEVERITIES, isActiveExposure, type ExposureSeverity } from "@/lib/domain/exposure";
import { displayPriority, SEVERITY_RANK } from "@/lib/domain/severity";
import { Exposure, type ExposureDoc } from "@/models/Exposure";
import { Identity } from "@/models/Identity";
import { getExposureProviders } from "@/server/providers/exposure/registry";

/**
 * Read model for exposure lists. Always scoped by `userId` (spec 12.1).
 * Ordering: active before closed, then display priority (severity with the
 * age modifier), then newest first. Bounded; pagination arrives with the
 * full exposures page.
 */
const LIST_LIMIT = 100;

type Row = ExposureDoc & { _id: Types.ObjectId };

export async function listExposuresForUser(
  userId: string,
  options: { identityId?: string; now?: Date } = {},
): Promise<ExposureView[]> {
  await connectToDatabase();
  const filter: Record<string, unknown> = { userId };
  if (options.identityId) {
    if (!Types.ObjectId.isValid(options.identityId)) return [];
    filter.identityId = new Types.ObjectId(options.identityId);
  }
  const [rows, identities] = await Promise.all([
    Exposure.find(filter).sort({ firstSeenAt: -1 }).limit(LIST_LIMIT).lean<Row[]>(),
    Identity.find({ userId }, { valueMasked: 1 }).lean(),
  ]);
  const masked = new Map(identities.map((i) => [String(i._id), i.valueMasked]));
  const now = options.now ?? new Date();

  const views = rows.map<ExposureView>((row) => ({
    id: String(row._id),
    sourceName: row.sourceName,
    sourceType: row.sourceType,
    severity: row.severity,
    breachDate: row.breachDate ? row.breachDate.toISOString() : null,
    discoveredAt: row.firstSeenAt.toISOString(),
    dataTypes: row.exposedDataTypes,
    detectionState: row.detectionState,
    remediationState: row.remediationState,
    sensitive: row.isSensitiveSource,
    identityMasked: masked.get(String(row.identityId)) ?? "removed identity",
    isDemo: row.isDemo,
    providers: row.providers,
  }));

  const rank = (v: ExposureView) =>
    SEVERITY_RANK[displayPriority(v.severity, v.breachDate ? new Date(v.breachDate) : null, now)];
  return views.sort(
    (a, b) =>
      Number(isActiveExposure(b)) - Number(isActiveExposure(a)) ||
      rank(b) - rank(a) ||
      Date.parse(b.discoveredAt) - Date.parse(a.discoveredAt),
  );
}

/** Attribution required by the providers behind these exposures (e.g. HIBP, CC BY 4.0). */
export function attributionsFor(providerNames: Iterable<string>): Array<{ name: string; url: string }> {
  const wanted = new Set(providerNames);
  const seen = new Map<string, { name: string; url: string }>();
  for (const provider of getExposureProviders()) {
    const attribution = provider.getCapabilities().attribution;
    if (attribution && wanted.has(provider.getName())) seen.set(attribution.url, attribution);
  }
  return [...seen.values()];
}

/** Active exposures (spec 7.7) per severity, across all of the user's identities. */
export async function activeSeverityCounts(userId: string): Promise<Record<ExposureSeverity, number>> {
  await connectToDatabase();
  const rows = await Exposure.aggregate<{ _id: ExposureSeverity; count: number }>([
    {
      $match: {
        userId,
        detectionState: { $ne: "no_longer_reported" },
        remediationState: { $nin: ["remediated", "dismissed"] },
      },
    },
    { $group: { _id: "$severity", count: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(EXPOSURE_SEVERITIES.map((s) => [s, 0])) as Record<
    ExposureSeverity,
    number
  >;
  for (const row of rows) counts[row._id] = row.count;
  return counts;
}
