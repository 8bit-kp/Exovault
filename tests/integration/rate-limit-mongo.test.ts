import { afterEach, describe, expect, it } from "vitest";
import { RATE_LIMITS } from "@/config/rate-limits";
import { getAuthDb } from "@/lib/db/mongo-client";
import { limit, setRateLimitStore } from "@/lib/rate-limit";
import { consume } from "@/lib/rate-limit/limiter";
import { ensureRateLimitIndexes, mongoStore, RATE_LIMIT_COLLECTION } from "@/lib/rate-limit/mongo-store";
import { signIn } from "@/server/services/account/auth-service";
import { ctx, setupAuthHarness } from "./helpers/auth-harness";

setupAuthHarness();

const rule = { name: "test:mongo", limit: 3, windowMs: 60_000, failClosed: true };

afterEach(async () => {
  setRateLimitStore(undefined);
  await getAuthDb().collection(RATE_LIMIT_COLLECTION).deleteMany({});
});

describe("MongoDB rate-limit store (D-040)", () => {
  it("counts within a window and starts a new one after it ends", async () => {
    let t = Date.parse("2026-10-13T10:00:00Z");
    const store = mongoStore(getAuthDb(), () => t);
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await consume(store, rule, "k1"));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3].retryAfterMs).toBe(60_000);

    t += 30_000;
    expect((await consume(store, rule, "k1")).retryAfterMs).toBe(30_000);
    t += 30_001; // window over, even though the TTL monitor hasn't removed the row yet
    expect(await consume(store, rule, "k1")).toMatchObject({ allowed: true, remaining: 2 });
  });

  it("never loses a count under concurrent hits on a new key", async () => {
    const store = mongoStore(getAuthDb());
    const counts = await Promise.all(Array.from({ length: 20 }, () => store.hit("rl:race", 60_000)));
    expect(counts.map((c) => c.count).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it("stores keyed hashes only, with a TTL index for cleanup", async () => {
    setRateLimitStore(mongoStore(getAuthDb()));
    await limit(RATE_LIMITS.signInPerAccount, "visible.person@example.com");
    const rows = JSON.stringify(await getAuthDb().collection(RATE_LIMIT_COLLECTION).find({}).toArray());
    expect(rows).toContain("rl:sign-in:account:");
    expect(rows).not.toContain("visible.person");
    expect(await ensureRateLimitIndexes(getAuthDb())).toBe("rate_limit_ttl");
  });

  it("enforces the real auth limits: the 6th sign-in from one IP is refused", async () => {
    setRateLimitStore(mongoStore(getAuthDb()));
    const ip = "203.0.113.150";
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(await signIn({ email: `m${i}@example.com`, password: "whatever password" }, ctx({ ip })));
    }
    expect(results[5]).toMatchObject({ ok: false, reason: "rate_limited" });
  });

  it("fails closed when MongoDB errors", async () => {
    const broken = mongoStore({
      collection: () => ({
        findOneAndUpdate: () => Promise.reject(new Error("connection reset")),
      }),
    } as never);
    await expect(consume(broken, rule, "k")).rejects.toThrow("Rate limiter unavailable");
  });
});
