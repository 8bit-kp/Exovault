import type { ExposedDataType, ExposureSourceType, IdentifierType } from "@/lib/domain/exposure";

/**
 * Contract every exposure provider implements. Provider-specific types and
 * quirks must stay inside `server/providers/exposure/<name>/`.
 *
 * Deviation from spec 7.2/7.3 (DECISIONS D-006): providers return
 * `ProviderExposure`, which deliberately has no `severity` or `discoveredAt`.
 * Severity is computed by our classifier and discovery time by the engine, so
 * a provider cannot influence either.
 */

export type RateLimitSpec = {
  /** Max requests allowed per window, across all jobs sharing this provider. */
  requests: number;
  windowMs: number;
};

export type ProviderCapabilities = {
  /** Human-readable source name for the UI, e.g. "Have I Been Pwned". */
  displayName?: string;
  identifierTypes: readonly IdentifierType[];
  rateLimit: RateLimitSpec;
  /** Required credit wherever this provider's data is shown (e.g. HIBP, CC BY 4.0). */
  attribution?: { name: string; url: string };
  /** True for deterministic demo providers: anything they return must be labelled "Demo data" (spec 4.3). */
  isDemo?: boolean;
};

/** A normalized, validated identifier, decrypted in memory for the call only. */
export type SearchIdentifier = {
  type: IdentifierType;
  normalizedValue: string;
};

export type ProviderContext = {
  signal?: AbortSignal;
  requestId?: string;
  scanId?: string;
};

export type ProviderExposure = {
  providerReference?: string;
  sourceName: string;
  sourceType: ExposureSourceType;
  breachDate?: Date;
  addedToProviderAt?: Date;
  exposedDataTypes: ExposedDataType[];
  isSensitiveSource: boolean;
  /** 0..1 — see docs/EXPOSURE-ENGINE.md for the definition. */
  confidence: number;
  /** Link to the provider's public breach page. Never raw data. */
  evidenceReference?: string;
};

export const PROVIDER_ERROR_CATEGORIES = [
  "rate_limited",
  "unavailable",
  "unauthorized",
  "timeout",
  "invalid_response",
] as const;
export type ProviderErrorCategory = (typeof PROVIDER_ERROR_CATEGORIES)[number];

export type ProviderSearchResult =
  | { status: "ok"; exposures: ProviderExposure[]; checkedAt: Date }
  | {
      status: "error";
      category: ProviderErrorCategory;
      retryable: boolean;
      /** Provider-advised wait (e.g. HTTP Retry-After), when known. */
      retryAfterMs?: number;
    };

export interface ExposureProvider {
  getName(): string;
  getCapabilities(): ProviderCapabilities;
  search(identifier: SearchIdentifier, ctx?: ProviderContext): Promise<ProviderSearchResult>;
}
