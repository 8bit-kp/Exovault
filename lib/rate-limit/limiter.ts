import type Redis from "ioredis";
import type { RateLimitRule } from "@/config/rate-limits";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Milliseconds until the window resets (0 when allowed and fresh). */
  retryAfterMs: number;
}

export interface RateLimitStore {
  /** Atomically count one hit in the rule's window; returns the new count and remaining TTL. */
  hit(key: string, windowMs: number): Promise<{ count: number; ttlMs: number }>;
}

/** Thrown when the store is unreachable and the rule fails closed. */
export class RateLimitUnavailableError extends Error {
  constructor(readonly rule: string) {
    super(`Rate limiter unavailable for ${rule}`);
    this.name = "RateLimitUnavailableError";
  }
}

/**
 * Fixed-window counter (D-020). `key` must already be a keyed hash, never a raw
 * email or IP: Redis keys are visible to anyone with Redis access.
 */
export async function consume(
  store: RateLimitStore,
  rule: RateLimitRule,
  key: string,
): Promise<RateLimitResult> {
  let count: number;
  let ttlMs: number;
  try {
    ({ count, ttlMs } = await store.hit(`rl:${rule.name}:${key}`, rule.windowMs));
  } catch {
    if (rule.failClosed) throw new RateLimitUnavailableError(rule.name);
    return { allowed: true, remaining: rule.limit, retryAfterMs: 0 };
  }
  const allowed = count <= rule.limit;
  return {
    allowed,
    remaining: Math.max(0, rule.limit - count),
    retryAfterMs: allowed ? 0 : Math.max(ttlMs, 0),
  };
}

// INCR + set expiry on first hit, atomically, so a crash can't leave a counter without a TTL.
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {count, ttl}
`;

export function redisStore(redis: Redis): RateLimitStore {
  return {
    async hit(key, windowMs) {
      const [count, ttl] = (await redis.eval(HIT_SCRIPT, 1, key, String(windowMs))) as [number, number];
      return { count, ttlMs: ttl };
    },
  };
}

/** In-process store for unit tests and as a reference implementation. */
export function memoryStore(now: () => number = Date.now): RateLimitStore & { clear(): void } {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    async hit(key, windowMs) {
      const current = windows.get(key);
      const t = now();
      if (!current || current.resetAt <= t) {
        windows.set(key, { count: 1, resetAt: t + windowMs });
        return { count: 1, ttlMs: windowMs };
      }
      current.count += 1;
      return { count: current.count, ttlMs: current.resetAt - t };
    },
    clear: () => windows.clear(),
  };
}
