import type { ExposedDataType } from "@/lib/domain/exposure";
import { classifySeverity } from "@/lib/domain/severity";
import type { NormalizedExposure } from "./types";

/** Reports more than this far apart are different incidents at the same source (D-026). */
export const SAME_INCIDENT_WINDOW_DAYS = 31;
const WINDOW_MS = SAME_INCIDENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Two reports describe the same incident when they name the same source and
 * their incident dates are within the window, or at least one date is unknown.
 */
export function isSameIncident(
  a: Pick<NormalizedExposure, "sourceKey" | "breachDate">,
  b: Pick<NormalizedExposure, "sourceKey" | "breachDate">,
): boolean {
  if (a.sourceKey !== b.sourceKey) return false;
  if (!a.breachDate || !b.breachDate) return true;
  return Math.abs(a.breachDate.getTime() - b.breachDate.getTime()) <= WINDOW_MS;
}

const sortedUnique = <T extends string>(values: T[]): T[] => [...new Set(values)].sort();

/**
 * Merge two reports of one incident. Keeps the union of providers, references
 * and data categories, the highest confidence, the earliest known incident
 * date, and the source name from the most confident report. Sensitive if
 * either says so. Severity is recomputed from the merged categories.
 */
export function mergeExposures(a: NormalizedExposure, b: NormalizedExposure): NormalizedExposure {
  const [primary, secondary] = a.confidence >= b.confidence ? [a, b] : [b, a];
  const breachDate =
    a.breachDate && b.breachDate
      ? new Date(Math.min(a.breachDate.getTime(), b.breachDate.getTime()))
      : (a.breachDate ?? b.breachDate);
  const exposedDataTypes = sortedUnique<ExposedDataType>([...a.exposedDataTypes, ...b.exposedDataTypes]);
  const sourceType =
    a.sourceType === "stealer_log" || b.sourceType === "stealer_log" ? "stealer_log" : primary.sourceType;
  const { severity, reason } = classifySeverity({ dataTypes: exposedDataTypes, sourceType });
  const refs = new Map(
    [...a.providerReferences, ...b.providerReferences].map((r) => [`${r.provider}:${r.reference}`, r]),
  );
  return {
    providers: sortedUnique([...a.providers, ...b.providers]),
    providerReferences: [...refs.values()].sort((x, y) =>
      `${x.provider}:${x.reference}`.localeCompare(`${y.provider}:${y.reference}`),
    ),
    sourceName: primary.sourceName || secondary.sourceName,
    sourceKey: primary.sourceKey,
    sourceType,
    breachDate,
    addedToProviderAt:
      a.addedToProviderAt && b.addedToProviderAt
        ? new Date(Math.min(a.addedToProviderAt.getTime(), b.addedToProviderAt.getTime()))
        : (a.addedToProviderAt ?? b.addedToProviderAt),
    exposedDataTypes,
    isSensitiveSource: a.isSensitiveSource || b.isSensitiveSource,
    confidence: Math.max(a.confidence, b.confidence),
    evidenceReferences: sortedUnique([...a.evidenceReferences, ...b.evidenceReferences]),
    severity,
    severityReason: reason,
    discoveredAt: new Date(Math.min(a.discoveredAt.getTime(), b.discoveredAt.getTime())),
  };
}

/**
 * Collapse one scan's reports (across providers) into distinct incidents.
 * Deterministic: output order and content don't depend on input order.
 */
export function deduplicateExposures(exposures: NormalizedExposure[]): NormalizedExposure[] {
  const ordered = [...exposures].sort(
    (x, y) =>
      x.sourceKey.localeCompare(y.sourceKey) ||
      (x.breachDate?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (y.breachDate?.getTime() ?? Number.MAX_SAFE_INTEGER) ||
      x.providers.join().localeCompare(y.providers.join()),
  );
  const clusters: NormalizedExposure[] = [];
  for (const exposure of ordered) {
    const index = clusters.findIndex((c) => isSameIncident(c, exposure));
    if (index === -1) clusters.push(exposure);
    else clusters[index] = mergeExposures(clusters[index], exposure);
  }
  return clusters;
}
