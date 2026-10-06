import type { ExposedDataType, ExposureSeverity, ExposureSourceType } from "@/lib/domain/exposure";

/**
 * The engine's normalized exposure (spec 7.3). Built from provider output by
 * the engine, never by a provider (D-006): `severity` comes from our
 * classifier, `discoveredAt` from our clock, `sourceKey` from our normalizer.
 * After dedupe one value may represent several providers' reports.
 */
export interface NormalizedExposure {
  providers: string[];
  providerReferences: Array<{ provider: string; reference: string }>;
  sourceName: string;
  /** Normalized source identity used for matching ("Adobe Inc." → "adobe"). */
  sourceKey: string;
  sourceType: ExposureSourceType;
  breachDate: Date | null;
  addedToProviderAt: Date | null;
  exposedDataTypes: ExposedDataType[];
  isSensitiveSource: boolean;
  /** 0..1: see docs/EXPOSURE-ENGINE.md. Max across merged reports. */
  confidence: number;
  evidenceReferences: string[];
  severity: ExposureSeverity;
  severityReason: string;
  discoveredAt: Date;
}
