import { describe, expect, it, vi } from "vitest";
import type { ExposureProvider, ProviderSearchResult } from "@/server/providers/exposure/interface";
import {
  backoffDelay,
  callWithResilience,
  DEFAULT_RETRY_POLICY,
} from "@/server/services/exposure/resilience";

const who = { type: "email" as const, normalizedValue: "a@example.org" };

function scripted(
  results: Array<ProviderSearchResult | Error | "hang">,
): ExposureProvider & { calls: number } {
  const provider = {
    calls: 0,
    getName: () => "scripted",
    getCapabilities: () => ({ identifierTypes: ["email"] as const, rateLimit: { requests: 1, windowMs: 1 } }),
    async search() {
      const next = results[Math.min(provider.calls++, results.length - 1)];
      if (next === "hang") return new Promise<ProviderSearchResult>(() => undefined);
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return provider;
}

const ok: ProviderSearchResult = { status: "ok", exposures: [], checkedAt: new Date() };
const unavailable: ProviderSearchResult = { status: "error", category: "unavailable", retryable: true };
const unauthorized: ProviderSearchResult = { status: "error", category: "unauthorized", retryable: false };
const policy = { ...DEFAULT_RETRY_POLICY, attemptTimeoutMs: 50 };
const noSleep = { sleep: vi.fn(async () => undefined), random: () => 0.5 };

describe("callWithResilience", () => {
  it("returns the first success without retrying", async () => {
    const p = scripted([ok]);
    expect(await callWithResilience(p, who, {}, policy, noSleep)).toEqual({ result: ok, attempts: 1 });
  });

  it("retries retryable errors and succeeds", async () => {
    const p = scripted([unavailable, unavailable, ok]);
    expect(await callWithResilience(p, who, {}, policy, noSleep)).toEqual({ result: ok, attempts: 3 });
  });

  it("gives up after maxAttempts (bounded)", async () => {
    const p = scripted([unavailable]);
    const { result, attempts } = await callWithResilience(p, who, {}, policy, noSleep);
    expect(result).toEqual(unavailable);
    expect(attempts).toBe(3);
    expect(p.calls).toBe(3);
  });

  it("never retries non-retryable errors (e.g. a bad API key)", async () => {
    const p = scripted([unauthorized, ok]);
    expect(await callWithResilience(p, who, {}, policy, noSleep)).toEqual({
      result: unauthorized,
      attempts: 1,
    });
  });

  it("waits at least the provider's Retry-After", async () => {
    const sleep = vi.fn(async () => undefined);
    const p = scripted([
      { status: "error", category: "rate_limited", retryable: true, retryAfterMs: 2_000 },
      ok,
    ]);
    await callWithResilience(p, who, {}, policy, { sleep, random: () => 0 });
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it("does not wait for a Retry-After longer than a scan can afford", async () => {
    const p = scripted([
      { status: "error", category: "rate_limited", retryable: true, retryAfterMs: 60_000 },
      ok,
    ]);
    const { result, attempts } = await callWithResilience(p, who, {}, policy, noSleep);
    expect(result).toMatchObject({ category: "rate_limited" });
    expect(attempts).toBe(1);
  });

  it("times out a hung provider, even one that ignores its AbortSignal", async () => {
    const p = scripted(["hang"]);
    const { result } = await callWithResilience(p, who, {}, { ...policy, maxAttempts: 1 }, noSleep);
    expect(result).toEqual({ status: "error", category: "timeout", retryable: true });
  });

  it("treats a thrown exception as unavailable rather than crashing the scan", async () => {
    const p = scripted([new Error("boom"), ok]);
    expect((await callWithResilience(p, who, {}, policy, noSleep)).result).toEqual(ok);
  });

  it("stops when the scan is cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const p = scripted([ok]);
    const { result, attempts } = await callWithResilience(
      p,
      who,
      { signal: controller.signal },
      policy,
      noSleep,
    );
    expect(result).toMatchObject({ category: "timeout" });
    expect(attempts).toBe(0);
    expect(p.calls).toBe(0);
  });
});

describe("backoffDelay", () => {
  it("grows exponentially, is capped, and is jittered within [0, ceiling]", () => {
    expect(backoffDelay(0, DEFAULT_RETRY_POLICY, () => 0.999)).toBeLessThan(300);
    expect(backoffDelay(2, DEFAULT_RETRY_POLICY, () => 0.999)).toBeLessThan(1_200);
    expect(backoffDelay(10, DEFAULT_RETRY_POLICY, () => 0.999)).toBeLessThan(3_000);
    expect(backoffDelay(3, DEFAULT_RETRY_POLICY, () => 0)).toBe(0);
  });
});
