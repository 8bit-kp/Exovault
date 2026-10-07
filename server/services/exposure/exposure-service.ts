import "server-only";
import { recordAuditEvent } from "@/lib/audit";
import { getExposureProviders } from "@/server/providers/exposure/registry";
import type { ExposureProvider } from "@/server/providers/exposure/interface";
import { withDecryptedIdentity } from "@/server/services/identity/identity-service";
import { searchExposures, type ProviderRunResult } from "./engine";
import { persistExposures, type ExposureDiff } from "./persistence";
import type { RetryPolicy } from "./resilience";

/**
 * One full check of one identity (spec 7.1): decrypt in memory → providers →
 * normalize/dedupe/classify → match/persist → diff. The scan lifecycle
 * (Phase 6) wraps this with persisted states, locks and progress.
 */
export interface CheckResult {
  outcome: "completed" | "partial" | "failed";
  providerResults: ProviderRunResult[];
  diff: ExposureDiff;
}

export type CheckIdentityResult =
  { ok: true; result: CheckResult } | { ok: false; reason: "not_found" | "not_verified" };

export function outcomeOf(results: ProviderRunResult[]): CheckResult["outcome"] {
  const attempted = results.filter((r) => r.state !== "skipped" || r.errorCategory === "circuit_open");
  const ok = attempted.filter((r) => r.state === "ok").length;
  if (ok === 0) return "failed";
  return ok === attempted.length ? "completed" : "partial";
}

export async function checkIdentityExposures(input: {
  userId: string;
  identityId: string;
  requestId?: string;
  scanId?: string;
  signal?: AbortSignal;
  providers?: ExposureProvider[];
  /** Test/ops override of the retry and timeout policy. */
  policy?: RetryPolicy;
}): Promise<CheckIdentityResult> {
  const providers = input.providers ?? getExposureProviders();
  const searched = await withDecryptedIdentity(input.userId, input.identityId, (identifier) =>
    searchExposures(identifier, {
      providers,
      policy: input.policy,
      requestId: input.requestId,
      scanId: input.scanId,
      signal: input.signal,
    }),
  );
  if (!searched.ok) return searched;

  const { providerResults, exposures } = searched.value;
  const outcome = outcomeOf(providerResults);
  // A failed check changes nothing: existing results stay as they were.
  const diff =
    outcome === "failed"
      ? { new: [], changed: [], escalated: [], existing: [], noLongerReported: [] }
      : await persistExposures({
          userId: input.userId,
          identityId: input.identityId,
          exposures,
          providerResults,
        });

  if (diff.new.length > 0) {
    await recordAuditEvent({
      event: "EXPOSURE_DETECTED",
      outcome: "success",
      userId: input.userId,
      requestId: input.requestId ?? null,
      metadata: {
        identityId: input.identityId,
        newCount: diff.new.length,
        changedCount: diff.changed.length,
      },
    });
  }
  return { ok: true, result: { outcome, providerResults, diff } };
}
