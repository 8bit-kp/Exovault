import { describe, expect, it } from "vitest";
import type { RateLimitRule } from "@/config/rate-limits";
import { RATE_LIMITS } from "@/config/rate-limits";
import {
  consume,
  memoryStore,
  RateLimitUnavailableError,
  type RateLimitStore,
} from "@/lib/rate-limit/limiter";

const rule: RateLimitRule = { name: "test", limit: 3, windowMs: 60_000, failClosed: true };

describe("consume", () => {
  it("allows up to the limit, then blocks with a retry-after", async () => {
    const store = memoryStore();
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await consume(store, rule, "k"));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[2].remaining).toBe(0);
    expect(results[3].retryAfterMs).toBeGreaterThan(0);
  });

  it("resets after the window", async () => {
    let now = 0;
    const store = memoryStore(() => now);
    for (let i = 0; i < 3; i++) await consume(store, rule, "k");
    expect((await consume(store, rule, "k")).allowed).toBe(false);
    now = 60_001;
    expect((await consume(store, rule, "k")).allowed).toBe(true);
  });

  it("counts keys independently", async () => {
    const store = memoryStore();
    for (let i = 0; i < 3; i++) await consume(store, rule, "a");
    expect((await consume(store, rule, "b")).allowed).toBe(true);
  });

  it("fails closed when the store is down and the rule requires it", async () => {
    const broken: RateLimitStore = { hit: () => Promise.reject(new Error("ECONNREFUSED")) };
    await expect(consume(broken, rule, "k")).rejects.toBeInstanceOf(RateLimitUnavailableError);
    await expect(consume(broken, { ...rule, failClosed: false }, "k")).resolves.toMatchObject({
      allowed: true,
    });
  });

  it("fails closed for every authentication rule (spec 12.3)", () => {
    for (const r of Object.values(RATE_LIMITS)) expect(r.failClosed).toBe(true);
  });
});
