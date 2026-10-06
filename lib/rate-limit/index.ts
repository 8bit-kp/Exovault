import type { RateLimitRule } from "@/config/rate-limits";
import { keyedHash } from "@/lib/crypto/keyed-hash";
import { getRedis } from "@/lib/redis/client";
import { consume, redisStore, type RateLimitResult, type RateLimitStore } from "./limiter";

export { RateLimitUnavailableError, type RateLimitResult } from "./limiter";

let store: RateLimitStore | undefined;

function getStore(): RateLimitStore {
  store ??= redisStore(getRedis());
  return store;
}

/** Test seam: swap the backing store (e.g. memoryStore, or a store that throws). */
export function setRateLimitStore(next: RateLimitStore | undefined): void {
  store = next;
}

/**
 * Count one attempt against `rule` for `subject` (an IP, a normalized email, a
 * user ID). The subject is HMAC'd before it becomes part of a Redis key.
 */
export function limit(rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
  return consume(getStore(), rule, keyedHash("rate-limit", subject));
}
