/**
 * Demo data (spec 4.3): a verified demo account with one verified identity and
 * realistic exposures from the deterministic DEMO providers. Fictional data
 * only; never real breach data, never a real third-party address.
 * Idempotent: re-running resets the demo data to its starting state.
 *
 * Usage: npm run seed            (requires PROVIDER_MODE=mock; refuses production)
 * The account is DEMO_ACCOUNT_EMAIL (default demo@exovault.example). Its password is
 * DEMO_ACCOUNT_PASSWORD (or SEED_DEMO_PASSWORD) when set, otherwise generated on creation.
 */
import { getEnv } from "@/config/env";
import { closeMongoClient } from "@/lib/db/mongo-client";
import { disconnectFromDatabase } from "@/lib/db/mongoose";
import { closeRedis } from "@/lib/redis/client";
import { Exposure } from "@/models/Exposure";
import { setEmailProvider } from "@/server/providers/email";
import { memoryEmailProvider } from "@/server/providers/email/memory";
import { provisionDemoAccount, resetDemoData } from "@/server/services/demo/demo-account";

async function main() {
  const env = getEnv();
  if (env.NODE_ENV === "production") throw new Error("Refusing to seed a production environment.");
  if (env.PROVIDER_MODE !== "mock")
    throw new Error("Seeding needs PROVIDER_MODE=mock (demo providers, no real lookups).");
  // The demo address is fictional: nothing the seed triggers (e.g. the sign-up code) is really emailed.
  setEmailProvider(memoryEmailProvider());

  const email = env.DEMO_ACCOUNT_EMAIL;
  const account = await provisionDemoAccount(
    email,
    env.DEMO_ACCOUNT_PASSWORD ?? process.env.SEED_DEMO_PASSWORD ?? null,
  );
  const scan = await resetDemoData(account.userId, account.identityId);

  console.log(
    JSON.stringify(
      {
        account: email,
        password: account.password ?? "(unchanged; set DEMO_ACCOUNT_PASSWORD to choose it)",
        identity: account.identityMasked,
        scan: scan.state,
        providers: scan.providers.map((p) => `${p.name}:${p.state}`),
        exposures: await Exposure.countDocuments({ userId: account.userId }),
        note: "All data is fictional and comes from demo providers. The UI labels it 'Demo data'.",
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([disconnectFromDatabase(), closeMongoClient(), closeRedis()]);
  });
