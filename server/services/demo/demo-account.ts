import "server-only";
import { randomBytes } from "node:crypto";
import { demoAccount, isDemoMode } from "@/config/demo";
import { getAuth } from "@/lib/auth/server";
import { getAuthDb } from "@/lib/db/mongo-client";
import { connectToDatabase } from "@/lib/db/mongoose";
import { logger } from "@/lib/logging/logger";
import { Exposure } from "@/models/Exposure";
import { Identity } from "@/models/Identity";
import { Notification } from "@/models/Notification";
import { RemediationAction } from "@/models/RemediationAction";
import { RiskScore } from "@/models/RiskScore";
import { Scan } from "@/models/Scan";
import { addEmailIdentity, listIdentities } from "@/server/services/identity/identity-service";
import { recomputeRiskScore } from "@/server/services/risk/risk-service";
import { createInProcessQueue } from "@/server/services/scan/queue";
import {
  getLatestScan,
  processScan,
  startManualScan,
  type ScanView,
} from "@/server/services/scan/scan-service";

/**
 * The demo account (spec 4.3, D-041): a verified account with one verified
 * identity and fictional exposures from the deterministic demo providers.
 * Used by `npm run seed` and, in demo mode, by the daily reset, so every
 * visitor of a showcase deployment starts from the same state.
 */

export interface DemoAccount {
  userId: string;
  identityId: string;
  identityMasked: string;
  /** The password, when this call created the account or set it; null when left unchanged. */
  password: string | null;
}

/** Creates the account if needed, sets the password when one is given, and ensures the verified identity. */
export async function provisionDemoAccount(email: string, password: string | null): Promise<DemoAccount> {
  await connectToDatabase();
  const users = getAuthDb().collection("user");
  const accounts = getAuthDb().collection("account");

  const existing = await users.findOne({ email });
  if (existing && (await accounts.countDocuments({ userId: existing._id })) === 0) {
    // A half-created demo account (no password) can't sign in: remove it and its data, then recreate.
    const id = String(existing._id);
    await Promise.all([
      Exposure.deleteMany({ userId: id }),
      Identity.deleteMany({ userId: id }),
      getAuthDb().collection("identityQuotas").deleteMany({ userId: id }),
      getAuthDb().collection("session").deleteMany({ userId: existing._id }),
    ]);
    await users.deleteOne({ _id: existing._id });
  }

  let passwordSet: string | null = null;
  if (!(await users.findOne({ email }))) {
    passwordSet = password ?? `demo-${randomBytes(9).toString("base64url")}`;
    // The public API path (scrypt hash, account row, hooks); then skip email verification for this account.
    await getAuth().api.signUpEmail({ body: { email, password: passwordSet, name: "" } });
  } else if (password) {
    // Keep the account's password in step with the configured one (it is shown on the demo sign-in page).
    const hash = await (await getAuth().$context).password.hash(password);
    const user = await users.findOne({ email });
    await accounts.updateOne({ userId: user!._id, providerId: "credential" }, { $set: { password: hash } });
    passwordSet = password;
  }
  await users.updateOne({ email }, { $set: { emailVerified: true } });
  const userDoc = await users.findOne({ email });
  if (!userDoc) throw new Error("Demo user missing after sign-up.");
  const userId = String(userDoc._id);

  let identity = (await listIdentities(userId)).find((i) => i.verification === "verified");
  if (!identity) {
    const added = await addEmailIdentity({ userId, accountEmail: email, accountEmailVerified: true }, email, {
      ip: "127.0.0.1",
      requestId: "demo",
    });
    if (!added.ok) throw new Error(`Could not add the demo identity (${added.reason}).`);
    identity = (await listIdentities(userId)).find((i) => i.id === added.identityId)!;
  }
  return { userId, identityId: identity.id, identityMasked: identity.masked, password: passwordSet };
}

/**
 * Puts the demo data back to its starting state: clears what visitors changed
 * (findings, checklist ticks, scans, scores, alerts, monitoring), then runs one
 * real manual scan and marks the low-severity finding as handled for variety.
 */
export async function resetDemoData(userId: string, identityId: string): Promise<ScanView> {
  await connectToDatabase();
  await Promise.all([
    Scan.deleteMany({ userId }),
    Exposure.deleteMany({ userId }),
    RemediationAction.deleteMany({ userId }),
    RiskScore.deleteMany({ userId }),
    Notification.deleteMany({ userId }),
  ]);
  await Identity.updateOne(
    { _id: identityId, userId },
    {
      $set: {
        "monitoring.enabled": false,
        "monitoring.frequency": null,
        "monitoring.nextScanAt": null,
        lastScanAt: null,
      },
    },
  );

  // A real scan through the normal pipeline, awaited here (no worker, no after()).
  const queue = createInProcessQueue((scanId) => processScan(scanId), 1);
  const started = await startManualScan(userId, identityId, { requestId: "demo-reset" }, new Date(), queue);
  if (!started.ok) throw new Error(`Demo scan failed to start (${started.reason}).`);
  await queue.drain();
  const scan = await getLatestScan(userId, identityId);
  if (!scan || !["completed", "partial"].includes(scan.state))
    throw new Error(`Demo scan did not complete (${scan?.state ?? "missing"}).`);

  await Exposure.updateOne(
    { userId, severity: "low", remediationState: "open" },
    { $set: { remediationState: "remediated", remediationStateChangedAt: new Date() } },
  );
  await recomputeRiskScore(userId, "remediation");
  return scan;
}

/** Daily cron, demo mode only: restore the shared account so every visitor sees the same demo. */
export async function resetDemoAccountIfEnabled(): Promise<boolean> {
  if (!isDemoMode()) return false;
  try {
    const { email, password } = demoAccount();
    const account = await provisionDemoAccount(email, password);
    await resetDemoData(account.userId, account.identityId);
    return true;
  } catch (error) {
    logger.error({ err: error instanceof Error ? error.name : "unknown" }, "demo reset failed");
    return false;
  }
}
