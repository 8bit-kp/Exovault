/**
 * Drops the local development database, then recreates indexes.
 * Destructive: requires `--yes`, and refuses anything but a local, non-production database.
 * Usage: npm run db:reset -- --yes
 */
import { execFileSync } from "node:child_process";
import { MongoClient } from "mongodb";
import { databaseNameOf, getEnv } from "@/config/env";

async function main() {
  const env = getEnv();
  const url = new URL(env.MONGODB_URI);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (env.NODE_ENV === "production" || !local) {
    console.error("Refusing: db:reset only runs against a local, non-production MongoDB.");
    process.exit(1);
  }
  if (!process.argv.includes("--yes")) {
    console.error(
      `This permanently deletes the "${databaseNameOf(env.MONGODB_URI)}" database. Re-run with --yes.`,
    );
    process.exit(1);
  }
  const client = new MongoClient(env.MONGODB_URI);
  try {
    await client.db().dropDatabase();
    console.log(`Dropped "${databaseNameOf(env.MONGODB_URI)}".`);
  } finally {
    await client.close();
  }
  execFileSync("npx", ["tsx", "--env-file-if-exists=.env.local", "scripts/db-indexes.ts"], {
    stdio: "inherit",
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
