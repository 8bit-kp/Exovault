import mongoose from "mongoose";
import { getEnv } from "@/config/env";

/**
 * One shared Mongoose connection per process. Cached on globalThis so Next.js
 * dev hot-reloads don't open a new pool on every edit.
 *
 * The design never requires multi-document transactions: local dev runs a
 * standalone MongoDB (DECISIONS D-004).
 */

type Cache = { promise?: Promise<typeof mongoose> };
const globalCache = globalThis as typeof globalThis & { __exovaultMongoose?: Cache };
const cache: Cache = (globalCache.__exovaultMongoose ??= {});

mongoose.set("strictQuery", true);
// Reject `$`-prefixed keys in query filters (operator-injection guard).
mongoose.set("sanitizeFilter", true);

/** Tests run against MONGODB_URI_TEST, never the dev database. */
export function defaultDatabaseUri(): string {
  const env = getEnv();
  return env.NODE_ENV === "test" ? env.MONGODB_URI_TEST : env.MONGODB_URI;
}

export function connectToDatabase(uri: string = defaultDatabaseUri()): Promise<typeof mongoose> {
  cache.promise ??= mongoose
    .connect(uri, {
      // Indexes are created explicitly by `npm run db:indexes`, never implicitly in production.
      autoIndex: getEnv().NODE_ENV !== "production",
      serverSelectionTimeoutMS: 5_000,
    })
    .catch((error: unknown) => {
      cache.promise = undefined;
      throw error;
    });
  return cache.promise;
}

export async function disconnectFromDatabase(): Promise<void> {
  if (cache.promise) {
    cache.promise = undefined;
    await mongoose.disconnect();
  }
}
