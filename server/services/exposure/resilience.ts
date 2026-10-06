import type {
  ExposureProvider,
  ProviderContext,
  ProviderSearchResult,
  SearchIdentifier,
} from "@/server/providers/exposure/interface";

/**
 * Per-provider call policy (spec 7.2): timeout per attempt, bounded retry with
 * exponential backoff and full jitter, provider-advised Retry-After respected
 * (or the retry skipped if it's too long to wait inside a scan). Pure apart
 * from the injected clock, so it is unit-tested deterministically.
 */
export interface RetryPolicy {
  maxAttempts: number;
  attemptTimeoutMs: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Don't wait longer than this for a Retry-After inside a scan. */
  maxRetryAfterMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  attemptTimeoutMs: 10_000,
  baseDelayMs: 300,
  maxDelayMs: 3_000,
  maxRetryAfterMs: 5_000,
};

export interface ResilienceDeps {
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface ResilientResult {
  result: ProviderSearchResult;
  attempts: number;
}

/** Full jitter: uniform in [0, min(max, base * 2^attempt)]. */
export function backoffDelay(
  attempt: number,
  policy: RetryPolicy,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** attempt);
  return Math.floor(random() * ceiling);
}

export async function callWithResilience(
  provider: ExposureProvider,
  identifier: SearchIdentifier,
  ctx: ProviderContext = {},
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  deps: ResilienceDeps = {},
): Promise<ResilientResult> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const random = deps.random ?? Math.random;
  let last: ProviderSearchResult = { status: "error", category: "unavailable", retryable: true };

  for (let attempt = 0; attempt < policy.maxAttempts; attempt++) {
    if (ctx.signal?.aborted)
      return { result: { status: "error", category: "timeout", retryable: true }, attempts: attempt };
    const signal = ctx.signal
      ? AbortSignal.any([ctx.signal, AbortSignal.timeout(policy.attemptTimeoutMs)])
      : AbortSignal.timeout(policy.attemptTimeoutMs);
    try {
      last = await raceWithSignal(provider.search(identifier, { ...ctx, signal }), signal);
    } catch {
      // A provider must return errors, not throw; a throw is treated as unavailable.
      last = { status: "error", category: signal.aborted ? "timeout" : "unavailable", retryable: true };
    }
    if (last.status === "ok" || !last.retryable || attempt === policy.maxAttempts - 1) {
      return { result: last, attempts: attempt + 1 };
    }
    if (last.retryAfterMs !== undefined && last.retryAfterMs > policy.maxRetryAfterMs) {
      return { result: last, attempts: attempt + 1 };
    }
    await sleep(Math.max(last.retryAfterMs ?? 0, backoffDelay(attempt, policy, random)));
  }
  return { result: last, attempts: policy.maxAttempts };
}

/** Enforces the timeout even if a provider ignores its AbortSignal. */
function raceWithSignal(
  promise: Promise<ProviderSearchResult>,
  signal: AbortSignal,
): Promise<ProviderSearchResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}
