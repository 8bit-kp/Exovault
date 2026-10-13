import type { Db } from "mongodb";
import type { RateLimitStore } from "./limiter";

/** Collection of fixed-window counters: `_id` is the keyed-hash key, never a raw email or IP. */
export const RATE_LIMIT_COLLECTION = "rateLimits";

interface CounterDoc {
  _id: string;
  count: number;
  expiresAt: Date;
}

/**
 * MongoDB-backed rate-limit store (D-040), for deployments without Redis.
 * One atomic `findOneAndUpdate` per hit: a pipeline update starts a new window
 * when the stored one has expired (or the row is new) and increments
 * otherwise, so concurrent hits never lose a count. A TTL index removes old
 * rows; rows past `expiresAt` but not yet removed are treated as expired.
 */
export function mongoStore(db: Db, now: () => number = Date.now): RateLimitStore {
  const counters = db.collection<CounterDoc>(RATE_LIMIT_COLLECTION);
  const hitOnce = async (key: string, windowMs: number) => {
    const at = new Date(now());
    const live = { $gt: ["$expiresAt", at] };
    const doc = await counters.findOneAndUpdate(
      { _id: key },
      [
        {
          $set: {
            count: { $cond: [live, { $add: ["$count", 1] }, 1] },
            expiresAt: { $cond: [live, "$expiresAt", new Date(at.getTime() + windowMs)] },
          },
        },
      ],
      { upsert: true, returnDocument: "after" },
    );
    if (!doc) throw new Error("rate-limit counter missing after upsert");
    return { count: doc.count, ttlMs: doc.expiresAt.getTime() - at.getTime() };
  };
  return {
    async hit(key, windowMs) {
      try {
        return await hitOnce(key, windowMs);
      } catch (error) {
        // Two first hits racing to insert the same key: one wins, the other retries as an update.
        if ((error as { code?: number }).code === 11000) return hitOnce(key, windowMs);
        throw error;
      }
    },
  };
}

/** TTL index: MongoDB deletes counters once their window has passed. Created by `npm run db:indexes`. */
export async function ensureRateLimitIndexes(db: Db): Promise<string> {
  return db
    .collection(RATE_LIMIT_COLLECTION)
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "rate_limit_ttl" });
}
