import { MongoClient, type Db } from "mongodb";
import { defaultDatabaseUri } from "./mongoose";

/**
 * Native driver client for Better Auth's adapter (it needs a `Db` up front).
 * Same driver version as Mongoose, separate small pool. Connects lazily on
 * first operation.
 */
const globalCache = globalThis as typeof globalThis & { __exovaultMongoClient?: MongoClient };

export function getMongoClient(): MongoClient {
  globalCache.__exovaultMongoClient ??= new MongoClient(defaultDatabaseUri(), {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5_000,
  });
  return globalCache.__exovaultMongoClient;
}

export function getAuthDb(): Db {
  return getMongoClient().db();
}

export async function closeMongoClient(): Promise<void> {
  const client = globalCache.__exovaultMongoClient;
  globalCache.__exovaultMongoClient = undefined;
  await client?.close();
}
