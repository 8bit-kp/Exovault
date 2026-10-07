import type {
  DetectionState,
  ExposedDataType,
  ExposureSeverity,
  ExposureSourceType,
  RemediationState,
} from "@/lib/domain/exposure";

/**
 * What exposure components render. Services map persisted documents onto this
 * shape, so components never see ciphertext, raw provider data, or anything
 * outside the signed-in user's own records. Dates are ISO strings so the type
 * crosses the server/client boundary unchanged.
 */
export interface ExposureView {
  id: string;
  /** Display name of the source. Omitted from list views when `sensitive` is true. */
  sourceName: string;
  sourceType: ExposureSourceType;
  severity: ExposureSeverity;
  /** When the provider says the incident happened, if known. */
  breachDate: string | null;
  /** When we first detected it for this identity. */
  discoveredAt: string;
  dataTypes: ExposedDataType[];
  detectionState: DetectionState;
  remediationState: RemediationState;
  /** Provider flagged the source as sensitive (adult, dating, health, ...). Spec 2.3. */
  sensitive: boolean;
  /** Masked identifier, e.g. k****n@example.com. Never the plaintext value. */
  identityMasked: string;
  /** From demo providers only: must be labelled "Demo data" (spec 4.3). */
  isDemo: boolean;
  /** Provider IDs that reported it (for attribution, e.g. HIBP's CC BY licence). */
  providers: string[];
}
