import Redis from "ioredis";
import { MongoClient } from "mongodb";
import { E2E_ENV } from "../../playwright.config";

/** Start every run from an empty E2E database, rate-limit counters, and mailbox. */
export default async function globalSetup() {
  const mongo = new MongoClient(E2E_ENV.MONGODB_URI, { serverSelectionTimeoutMS: 5_000 });
  try {
    await mongo.db().dropDatabase();
  } finally {
    await mongo.close();
  }
  const redis = new Redis(E2E_ENV.REDIS_URL);
  try {
    await redis.flushdb();
  } finally {
    redis.disconnect();
  }
  await fetch("http://127.0.0.1:8025/api/v1/messages", { method: "DELETE" }).catch(() => undefined);
}
