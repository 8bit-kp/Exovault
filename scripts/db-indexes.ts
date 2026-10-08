/**
 * Creates every index explicitly (spec 4.5). Safe to run repeatedly.
 * Usage: npm run db:indexes
 */
import { MongoClient } from "mongodb";
import mongoose from "mongoose";
import { getEnv } from "@/config/env";
import { ensureAuthIndexes } from "@/lib/db/auth-indexes";
import { AccountDeletion } from "@/models/AccountDeletion";
import { AuditLog } from "@/models/AuditLog";
import { Breach } from "@/models/Breach";
import { Exposure } from "@/models/Exposure";
import { Notification } from "@/models/Notification";
import { NotificationPreference } from "@/models/NotificationPreference";
import { PendingSignup } from "@/models/PendingSignup";
import { ProviderState } from "@/models/ProviderState";
import { RemediationAction } from "@/models/RemediationAction";
import { RiskScore } from "@/models/RiskScore";
import { Scan } from "@/models/Scan";
import { Identity } from "@/models/Identity";
import { IdentityQuota } from "@/models/IdentityQuota";
import { IdentityVerification } from "@/models/IdentityVerification";

async function main() {
  const uri = getEnv().MONGODB_URI;
  await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 5_000 });
  const client = new MongoClient(uri);
  try {
    for (const model of [
      AuditLog,
      Identity,
      IdentityVerification,
      IdentityQuota,
      Breach,
      Exposure,
      ProviderState,
      Scan,
      RiskScore,
      RemediationAction,
      Notification,
      NotificationPreference,
      PendingSignup,
      AccountDeletion,
    ]) {
      const dropped = await model.syncIndexes();
      console.log(
        `${model.collection.name}: synced (dropped: ${dropped.length ? dropped.join(", ") : "none"})`,
      );
    }
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
