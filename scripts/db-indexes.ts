/**
 * Creates every index explicitly (spec 4.5). Safe to run repeatedly.
 * Usage: npm run db:indexes
 */
import { MongoClient } from "mongodb";
import mongoose from "mongoose";
import { getEnv } from "@/config/env";
import { ensureAuthIndexes } from "@/lib/db/auth-indexes";
import { AuditLog } from "@/models/AuditLog";

async function main() {
  const uri = getEnv().MONGODB_URI;
  await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 5_000 });
  const client = new MongoClient(uri);
  try {
    const synced = await AuditLog.syncIndexes();
    console.log(`auditLogs: synced (dropped: ${synced.length ? synced.join(", ") : "none"})`);
    const created = await ensureAuthIndexes(client.db());
    console.log(`better-auth collections: ${created.join(", ")}`);
  } finally {
    await client.close();
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
