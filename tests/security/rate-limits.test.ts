import { afterEach, describe, expect, it } from "vitest";
import { getAuthDb } from "@/lib/db/mongo-client";
import { setRateLimitStore } from "@/lib/rate-limit";
import {
  requestPasswordReset,
  resendVerificationCode,
  signIn,
  signUp,
} from "@/server/services/account/auth-service";
import { ctx, flushBackground, outbox, setupAuthHarness } from "../integration/helpers/auth-harness";

setupAuthHarness();
afterEach(() => setRateLimitStore(undefined));

describe("rate limits (spec 12.3)", () => {
  it("blocks the 6th sign-in from one IP within 15 minutes", async () => {
    const sameIp = "203.0.113.50";
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(
        await signIn({ email: `user${i}@example.com`, password: "whatever password" }, ctx({ ip: sameIp })),
      );
    }
    expect(results.slice(0, 5).every((r) => !r.ok && r.reason === "invalid")).toBe(true);
    expect(results[5]).toMatchObject({ ok: false, reason: "rate_limited" });
  });

  it("blocks the 6th attempt on one account even when every attempt uses a new IP", async () => {
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(await signIn({ email: "target@example.com", password: `guess number ${i}!!` }, ctx()));
    }
    expect(results[5]).toMatchObject({ ok: false, reason: "rate_limited" });
  });

  it("limits sign-ups per IP to 5 an hour", async () => {
    const ip = "203.0.113.60";
    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(
        await signUp({ email: `new${i}@example.com`, password: "a long enough password" }, ctx({ ip })),
      );
    }
    expect(results[5]).toMatchObject({ ok: false, reason: "rate_limited" });
    expect(await getAuthDb().collection("user").countDocuments()).toBe(5);
  });

  it("limits verification resends to 3 an hour per account", async () => {
    await signUp({ email: "ana@example.com", password: "a long enough password" }, ctx());
    const results = [];
    for (let i = 0; i < 4; i++)
      results.push(await resendVerificationCode({ email: "ana@example.com" }, ctx()));
    expect(results[3]).toMatchObject({ ok: false, reason: "rate_limited" });
  });

  it("limits password-reset requests to 3 an hour per account", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await requestPasswordReset({ email: "ana@example.com" }, ctx()));
    expect(results[3]).toMatchObject({ ok: false, reason: "rate_limited" });
  });

  it("fails closed when Redis is unavailable: no auth call is made", async () => {
    setRateLimitStore({ hit: () => Promise.reject(new Error("ECONNREFUSED")) });
    expect(await signIn({ email: "a@example.com", password: "irrelevant pw" }, ctx())).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(await signUp({ email: "b@example.com", password: "a long enough password" }, ctx())).toEqual({
      ok: false,
      reason: "unavailable",
    });
    await flushBackground();
    expect(await getAuthDb().collection("user").countDocuments()).toBe(0);
    expect(outbox.outbox).toHaveLength(0);
  });

  it("keys Redis counters by keyed hash, never by raw email or IP", async () => {
    const { getRedis } = await import("@/lib/redis/client");
    await signIn(
      { email: "visible@example.com", password: "whatever password" },
      ctx({ ip: "203.0.113.77" }),
    );
    const keys = await getRedis().keys("rl:*");
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).not.toContain("visible@example.com");
      expect(key).not.toContain("203.0.113.77");
    }
  });

  it("audits rate-limit denials", async () => {
    for (let i = 0; i < 6; i++) await signIn({ email: "t@example.com", password: "guess guess" }, ctx());
    const denied = await getAuthDb().collection("auditLogs").countDocuments({ event: "RATE_LIMITED" });
    expect(denied).toBeGreaterThan(0);
  });
});
