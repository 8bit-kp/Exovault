/**
 * Operator deletion of one account and all of its data (D-043: the old shared
 * demo account). Dry run by default; `--confirm` deletes. Sends no email.
 *
 * Usage: npm run account:delete -- --email demo@exovault.example
 *        npm run account:delete -- --email demo@exovault.example --confirm
 * Targets MONGODB_URI from the environment: check the database it prints.
 */
import { databaseNameOf, getEnv } from "@/config/env";
import { recordAuditEvent } from "@/lib/audit";
import { closeMongoClient, getAuthDb } from "@/lib/db/mongo-client";
import { connectToDatabase, disconnectFromDatabase } from "@/lib/db/mongoose";
import { closeRedis } from "@/lib/redis/client";
import { AccountDeletion } from "@/models/AccountDeletion";
import { Exposure } from "@/models/Exposure";
import { Identity } from "@/models/Identity";
import { Scan } from "@/models/Scan";
import { eraseAccountData } from "@/server/services/account/account-deletion-service";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const email = arg("--email")?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: npm run account:delete -- --email <address> [--confirm]");
    process.exitCode = 2;
    return;
  }
  const uri = getEnv().MONGODB_URI;
  console.log(`Database: ${databaseNameOf(uri)} on ${new URL(uri).hostname}`);

  await connectToDatabase();
  const user = await getAuthDb().collection("user").findOne({ email });
  if (!user) {
    console.log("No account with that email. Nothing to do.");
    return;
  }
  const userId = String(user._id);
  const [identities, scans, exposures] = await Promise.all([
    Identity.countDocuments({ userId }),
    Scan.countDocuments({ userId }),
    Exposure.countDocuments({ userId }),
  ]);
  console.log(`Found account ${userId}: ${identities} identities, ${scans} scans, ${exposures} exposures.`);

  if (!process.argv.includes("--confirm")) {
    console.log("Dry run. Re-run with --confirm to delete it permanently.");
    return;
  }
  await eraseAccountData(userId, email);
  await AccountDeletion.deleteMany({ userId });
  await recordAuditEvent({ event: "ACCOUNT_DELETED", outcome: "success", userId: null });
  const left = await getAuthDb().collection("user").countDocuments({ email });
  console.log(left === 0 ? "Deleted." : "Account row still present: re-run the command.");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([disconnectFromDatabase(), closeMongoClient(), closeRedis()]);
  });
