import { Types } from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getEnv } from "@/config/env";
import { getAuth } from "@/lib/auth/server";
import { getAuthDb } from "@/lib/db/mongo-client";
import { logger, setLogSink } from "@/lib/logging/logger";
import { Identity } from "@/models/Identity";
import { createMockProvider } from "@/server/providers/exposure/mock";
import * as account from "@/server/services/account/auth-service";
import { DEFAULT_RETRY_POLICY } from "@/server/services/exposure/resilience";
import {
  addEmailIdentity,
  revealIdentity,
  verifyIdentityCode,
} from "@/server/services/identity/identity-service";
import { enableMonitoring, runMonitoringTick } from "@/server/services/monitoring/monitoring-service";
import {
  dispatchDueNotifications,
  setNotificationProvider,
  unsubscribeWithToken,
} from "@/server/services/notification/notification-service";
import { configureScanProcessing, getScanQueue } from "@/server/services/scan/scan-service";
import {
  ctx,
  flushBackground,
  latestCode,
  latestIdentityCode,
  latestResetToken,
  setupAuthHarness,
} from "../integration/helpers/auth-harness";

/**
 * Spec 12.5: run real flows with known secrets and scan the *serialized* log
 * output (after redaction) for any of them. Logging is turned up to trace so
 * nothing is hidden by level.
 */
setupAuthHarness();

const lines: string[] = [];
const previousLevel = logger.level;
beforeAll(() => {
  setLogSink({ write: (line: string) => void lines.push(line) });
  logger.level = "trace";
});
afterAll(() => {
  setLogSink(undefined);
  logger.level = previousLevel;
  setNotificationProvider(undefined);
  configureScanProcessing({});
});

describe("no secrets or identifiers in logs", () => {
  it("across auth, identity, scanning, alerts and failure paths", async () => {
    const planted = new Set<string>();
    const email = "planted.person.zx81@example.com";
    const password = "planted-password-correct-horse-9921";
    const other = "planted.other.qq44@example.org";
    planted.add(email).add("planted.person.zx81").add(password).add(other).add("planted.other.qq44");

    // Auth: sign-up, wrong and right verification codes, wrong password, reset.
    const signedUp = await account.signUp({ email, password }, ctx());
    const nonce = (signedUp as { nonce?: string | null }).nonce ?? null;
    await flushBackground();
    const code = latestCode(email);
    planted.add(code);
    await account.verifyEmailCode({ email, code: code === "000000" ? "111111" : "000000", nonce }, ctx());
    await account.verifyEmailCode({ email, code, nonce }, ctx());
    await account.signIn({ email, password: "wrong-planted-password-77" }, ctx());
    planted.add("wrong-planted-password-77");
    const { headers } = await getAuth().api.signInEmail({
      body: { email, password },
      headers: ctx().headers,
      returnHeaders: true,
    });
    const sessionToken = headers
      .getSetCookie()
      .find((c) => c.includes("session_token"))!
      .split(";")[0]
      .split("=")[1];
    planted.add(decodeURIComponent(sessionToken).split(".")[0]);
    await account.requestPasswordReset({ email }, ctx());
    await flushBackground();
    const resetToken = latestResetToken(email);
    planted.add(resetToken);
    await account.resetPassword({ token: resetToken, password: "planted-new-password-5512" }, ctx());
    await account.resetPassword({ token: resetToken, password: "planted-new-password-5512" }, ctx()); // reused: fails
    planted.add("planted-new-password-5512");

    // Identities: an address needing a code, a wrong code, a reveal.
    const user = await getAuthDb().collection("user").findOne({ email });
    const userId = String(user!._id);
    const actor = { userId, accountEmail: email, accountEmailVerified: true };
    const added = await addEmailIdentity(actor, other, { ip: "203.0.113.90", requestId: "r" });
    if (!added.ok) throw new Error("setup");
    const identityCode = latestIdentityCode(other);
    planted.add(identityCode);
    await verifyIdentityCode(actor, added.identityId, "000001", { ip: "x", requestId: "r" });
    await verifyIdentityCode(actor, added.identityId, identityCode, { ip: "x", requestId: "r" });
    await revealIdentity(actor, added.identityId, { ip: "x", requestId: "r" });

    // Scheduled scan with a failing provider (warn logs) and a failing alert send (error logs).
    configureScanProcessing({
      providers: [createMockProvider("multiple", "mock-a"), createMockProvider("failing", "mock-down")],
      policy: { ...DEFAULT_RETRY_POLICY, attemptTimeoutMs: 150, baseDelayMs: 1, maxDelayMs: 2 },
    });
    await enableMonitoring(userId, added.identityId, "6h", { requestId: "r" });
    await Identity.updateOne(
      { _id: new Types.ObjectId(added.identityId) },
      { $set: { "monitoring.nextScanAt": new Date(0) } },
    );
    await runMonitoringTick();
    await getScanQueue().drain();
    setNotificationProvider({
      channel: "email",
      send: async () => {
        throw new Error(`SMTP rejected recipient ${email}`); // a provider error that itself contains PII
      },
    });
    await dispatchDueNotifications();
    await unsubscribeWithToken("forged-token-with-junk");

    // Server-side secrets.
    const env = getEnv();
    planted.add(env.AUTH_SECRET).add(env.BLIND_INDEX_PEPPER);
    for (const key of env.IDENTIFIER_ENCRYPTION_KEYS.values()) planted.add(key);

    const output = lines.join("");
    // The risky paths really were exercised and logged (so a pass means something).
    expect(output).toContain('"msg":"provider search failed"');
    expect(output).toContain('"msg":"alert send failed"');
    expect(output).toContain('"component":"better-auth"');
    for (const secret of planted) {
      expect(output.includes(secret), `log output contains a planted secret (${secret.slice(0, 4)}…)`).toBe(
        false,
      );
    }
    // And nothing that looks like an email address at all.
    expect(output).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  });
});
