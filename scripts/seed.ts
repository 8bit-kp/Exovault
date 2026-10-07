/**
 * Demo data (spec 4.3): a verified demo account with one verified identity and
 * realistic exposures from the deterministic DEMO providers. Fictional data
 * only; never real breach data, never a real third-party address.
 * Idempotent: re-running reuses the account and rescans.
 *
 * Usage: npm run seed            (requires PROVIDER_MODE=mock; refuses production)
 */
import { randomBytes } from "node:crypto";
import { getEnv } from "@/config/env";
import { getAuth } from "@/lib/auth/server";
import { closeMongoClient, getAuthDb } from "@/lib/db/mongo-client";
import { connectToDatabase, disconnectFromDatabase } from "@/lib/db/mongoose";
import { closeRedis } from "@/lib/redis/client";
import { Exposure } from "@/models/Exposure";
import { addEmailIdentity, listIdentities } from "@/server/services/identity/identity-service";
import { createInProcessQueue } from "@/server/services/scan/queue";
import {
  getLatestScan,
  processScan,
  setScanQueue,
  startManualScan,
} from "@/server/services/scan/scan-service";

const DEMO_EMAIL = "demo@exovault.example";

async function main() {
  const env = getEnv();
  if (env.NODE_ENV === "production") throw new Error("Refusing to seed a production environment.");
  if (env.PROVIDER_MODE !== "mock")
    throw new Error("Seeding needs PROVIDER_MODE=mock (demo providers, no real lookups).");
  await connectToDatabase();

  const users = getAuthDb().collection("user");
  let password: string | null = null;
  const existing = await users.findOne({ email: DEMO_EMAIL });
  if (existing && (await getAuthDb().collection("account").countDocuments({ userId: existing._id })) === 0) {
    // A half-created demo account (no password) can't sign in: remove it and its demo data, then recreate.
    const id = String(existing._id);
    await Promise.all([
      Exposure.deleteMany({ userId: id }),
      getAuthDb().collection("identities").deleteMany({ userId: id }),
      getAuthDb().collection("identityQuotas").deleteMany({ userId: id }),
      getAuthDb().collection("session").deleteMany({ userId: existing._id }),
    ]);
    await users.deleteOne({ _id: existing._id });
  }
  if (!(await users.findOne({ email: DEMO_EMAIL }))) {
    password = process.env.SEED_DEMO_PASSWORD ?? `demo-${randomBytes(9).toString("base64url")}`;
    // The public API path (scrypt hash, account row, hooks); then skip email verification for the demo account.
    await getAuth().api.signUpEmail({ body: { email: DEMO_EMAIL, password, name: "" } });
    await users.updateOne({ email: DEMO_EMAIL }, { $set: { emailVerified: true } });
  }
  const userDoc = await users.findOne({ email: DEMO_EMAIL });
  if (!userDoc) throw new Error("Demo user missing after sign-up.");
  const user = { id: String(userDoc._id) };

  const requestCtx = { ip: "127.0.0.1", requestId: "seed" };
  let identity = (await listIdentities(user.id)).find((i) => i.verification === "verified");
  if (!identity) {
    const added = await addEmailIdentity(
      { userId: user.id, accountEmail: DEMO_EMAIL, accountEmailVerified: true },
      DEMO_EMAIL,
      requestCtx,
    );
    if (!added.ok) throw new Error(`Could not add the demo identity (${added.reason}).`);
    identity = (await listIdentities(user.id)).find((i) => i.id === added.identityId)!;
  }

  // A real manual scan, run in this process (no worker needed), so the demo has a Scan
  // record, a last-scan time and timeline entries, exactly like a user-started scan.
  const queue = createInProcessQueue(processScan, 1);
  setScanQueue(queue);
  const started = await startManualScan(user.id, identity.id, { requestId: "seed" });
  if (!started.ok && started.reason !== "cooldown") throw new Error(`Demo scan failed (${started.reason}).`);
  await queue.drain();
  const scan = await getLatestScan(user.id, identity.id);
  if (!scan || !["completed", "partial"].includes(scan.state))
    throw new Error(`Demo scan did not complete (${scan?.state ?? "missing"}).`);

  // Variety for the UI: mark the oldest, low-severity exposure as already handled.
  await Exposure.updateOne(
    { userId: user.id, severity: "low", remediationState: "open" },
    { $set: { remediationState: "remediated", remediationStateChangedAt: new Date() } },
  );

  const total = await Exposure.countDocuments({ userId: user.id });
  console.log(
    JSON.stringify(
      {
        account: DEMO_EMAIL,
        password: password ?? "(unchanged; set SEED_DEMO_PASSWORD on first seed to choose it)",
        identity: identity.masked,
        scan: started.ok ? scan.state : `${scan.state} (reused; manual-scan cooldown)`,
        providers: scan.providers.map((p) => `${p.name}:${p.state}`),
        exposures: total,
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
