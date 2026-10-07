import { logger } from "@/lib/logging/logger";
import { classifySeverity } from "@/lib/domain/severity";
import { limit, RateLimitUnavailableError } from "@/lib/rate-limit";
import type {
  ExposureProvider,
  ProviderErrorCategory,
  ProviderExposure,
  SearchIdentifier,
} from "@/server/providers/exposure/interface";
import { deduplicateExposures } from "./dedupe";
import { isCircuitOpen, recordProviderFailure, recordProviderSuccess } from "./provider-state";
import {
  callWithResilience,
  DEFAULT_RETRY_POLICY,
  type ResilienceDeps,
  type RetryPolicy,
} from "./resilience";
import { normalizeSourceKey } from "./source-key";
import type { NormalizedExposure } from "./types";

/**
 * Exposure engine (spec 7.1): providers in parallel → per-provider mapping →
 * our severity → dedupe. Provider failures are results, not exceptions: one
 * failing source never hides another's findings (spec 13.8 partial failure).
 * Persistence and diffing live in persistence.ts.
 */

export type ProviderRunState = "ok" | "error" | "skipped";

export interface ProviderRunResult {
  provider: string;
  state: ProviderRunState;
  /** Why it failed or was skipped. Safe to show users as a category. */
  errorCategory?: ProviderErrorCategory | "circuit_open" | "budget_exhausted";
  count: number;
  attempts: number;
  startedAt: Date;
  finishedAt: Date;
  isDemo: boolean;
}

export interface EngineResult {
  providerResults: ProviderRunResult[];
  exposures: NormalizedExposure[];
}

export interface EngineOptions {
  providers: ExposureProvider[];
  signal?: AbortSignal;
  requestId?: string;
  scanId?: string;
  now?: () => Date;
  policy?: RetryPolicy;
  deps?: ResilienceDeps;
  /** Called as each provider settles, so scans can persist per-source progress as it happens. */
  onProviderSettled?: (result: ProviderRunResult) => Promise<void> | void;
}

/**
 * Evidence links are rendered as <a href>: only absolute https URLs survive,
 * whatever a provider returns (no javascript:, data:, or relative URLs).
 */
export function safeEvidenceUrl(value: string | undefined): string[] {
  if (!value || value.length > 500) return [];
  try {
    return new URL(value).protocol === "https:" ? [value] : [];
  } catch {
    return [];
  }
}

export function toNormalizedExposure(
  provider: ExposureProvider,
  exposure: ProviderExposure,
  now: Date,
): NormalizedExposure {
  const exposedDataTypes = [...new Set(exposure.exposedDataTypes)].sort();
  const { severity, reason } = classifySeverity({
    dataTypes: exposedDataTypes,
    sourceType: exposure.sourceType,
  });
  const name = provider.getName();
  return {
    providers: [name],
    providerReferences: exposure.providerReference
      ? [{ provider: name, reference: exposure.providerReference }]
      : [],
    sourceName: exposure.sourceName,
    sourceKey: normalizeSourceKey(exposure.sourceName),
    sourceType: exposure.sourceType,
    breachDate: exposure.breachDate ?? null,
    addedToProviderAt: exposure.addedToProviderAt ?? null,
    exposedDataTypes,
    isSensitiveSource: exposure.isSensitiveSource,
    confidence: Math.min(1, Math.max(0, exposure.confidence)),
    evidenceReferences: safeEvidenceUrl(exposure.evidenceReference),
    severity,
    severityReason: reason,
    discoveredAt: now,
  };
}

async function runProvider(
  provider: ExposureProvider,
  identifier: SearchIdentifier,
  options: EngineOptions,
): Promise<{ run: ProviderRunResult; exposures: NormalizedExposure[] }> {
  const now = options.now ?? (() => new Date());
  const name = provider.getName();
  const capabilities = provider.getCapabilities();
  const startedAt = now();
  const finish = (partial: Omit<ProviderRunResult, "provider" | "startedAt" | "finishedAt" | "isDemo">) => ({
    provider: name,
    startedAt,
    finishedAt: now(),
    isDemo: Boolean(capabilities.isDemo),
    ...partial,
  });

  if (!capabilities.identifierTypes.includes(identifier.type)) {
    return { run: finish({ state: "skipped", count: 0, attempts: 0 }), exposures: [] };
  }
  if (await isCircuitOpen(name, startedAt)) {
    return {
      run: finish({ state: "skipped", errorCategory: "circuit_open", count: 0, attempts: 0 }),
      exposures: [],
    };
  }

  // Shared budget across every scan and worker, so we stay inside the provider's rate limit.
  try {
    const budget = await limit(
      {
        name: `provider-budget:${name}`,
        limit: capabilities.rateLimit.requests,
        windowMs: capabilities.rateLimit.windowMs,
        failClosed: true,
      },
      "global",
    );
    if (!budget.allowed) {
      return {
        run: finish({ state: "error", errorCategory: "budget_exhausted", count: 0, attempts: 0 }),
        exposures: [],
      };
    }
  } catch (error) {
    if (!(error instanceof RateLimitUnavailableError)) throw error;
    return {
      run: finish({ state: "error", errorCategory: "unavailable", count: 0, attempts: 0 }),
      exposures: [],
    };
  }

  const { result, attempts } = await callWithResilience(
    provider,
    identifier,
    { signal: options.signal, requestId: options.requestId, scanId: options.scanId },
    options.policy ?? DEFAULT_RETRY_POLICY,
    options.deps,
  );

  if (result.status === "error") {
    await recordProviderFailure(name, result.category);
    logger.warn(
      {
        provider: name,
        category: result.category,
        attempts,
        scanId: options.scanId,
        requestId: options.requestId,
      },
      "provider search failed",
    );
    return {
      run: finish({ state: "error", errorCategory: result.category, count: 0, attempts }),
      exposures: [],
    };
  }

  await recordProviderSuccess(name);
  const discoveredAt = now();
  const exposures = result.exposures.map((e) => toNormalizedExposure(provider, e, discoveredAt));
  return { run: finish({ state: "ok", count: exposures.length, attempts }), exposures };
}

/** Providers only: per-provider results and their normalized (not yet deduplicated) reports. */
export async function runProviders(
  identifier: SearchIdentifier,
  options: EngineOptions,
): Promise<EngineResult> {
  const outcomes = await Promise.all(
    options.providers.map(async (p) => {
      const outcome = await runProvider(p, identifier, options);
      await options.onProviderSettled?.(outcome.run);
      return outcome;
    }),
  );
  return { providerResults: outcomes.map((o) => o.run), exposures: outcomes.flatMap((o) => o.exposures) };
}

export async function searchExposures(
  identifier: SearchIdentifier,
  options: EngineOptions,
): Promise<EngineResult> {
  const { providerResults, exposures } = await runProviders(identifier, options);
  return { providerResults, exposures: deduplicateExposures(exposures) };
}
