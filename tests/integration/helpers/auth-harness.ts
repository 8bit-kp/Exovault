import { afterAll, beforeAll, beforeEach } from "vitest";
import { ensureAuthIndexes } from "@/lib/db/auth-indexes";
import { closeMongoClient, getAuthDb } from "@/lib/db/mongo-client";
import { connectToDatabase, disconnectFromDatabase } from "@/lib/db/mongoose";
import { getAuth, resetAuth } from "@/lib/auth/server";
import { closeRedis, getRedis } from "@/lib/redis/client";
import { setRateLimitStore } from "@/lib/rate-limit";
import { memoryEmailProvider } from "@/server/providers/email/memory";
import { setEmailProvider } from "@/server/providers/email";
import type { RequestContext } from "@/server/services/account/auth-service";

export const APP_ORIGIN = "http://127.0.0.1:3100";
export const outbox = memoryEmailProvider();

let ipCounter = 0;

/** A fresh client IP per call, so per-IP limits don't leak between tests unless a test wants them to. */
export function ctx(overrides: Partial<RequestContext> & { cookie?: string } = {}): RequestContext {
  const headers = new Headers({ origin: APP_ORIGIN, "user-agent": "vitest" });
  if (overrides.cookie) headers.set("cookie", overrides.cookie);
  return {
    headers: overrides.headers ?? headers,
    ip: overrides.ip ?? `198.51.100.${(ipCounter++ % 250) + 1}`,
    requestId: overrides.requestId ?? "test-request",
  };
}

/** Wait for fire-and-forget email sends to settle. */
export async function flushBackground(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

export function latestCode(to: string): string {
  const message = [...outbox.outbox].reverse().find((m) => m.to === to && m.kind === "verify-email");
  const code = message?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error("no verification code sent");
  return code;
}

export function latestResetToken(to: string): string {
  const message = [...outbox.outbox].reverse().find((m) => m.to === to && m.kind === "reset-password");
  const token = message?.text.match(/token=([^\s&]+)/)?.[1];
  if (!token) throw new Error("no reset email sent");
  return decodeURIComponent(token);
}

/** Session cookie header from a Better Auth `returnHeaders` result. */
export function cookieFrom(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

export function setupAuthHarness() {
  beforeAll(async () => {
    setEmailProvider(outbox);
    setRateLimitStore(undefined);
    resetAuth();
    await connectToDatabase();
    // Production indexes (npm run db:indexes) must coexist with the auth library's own writes.
    await ensureAuthIndexes(getAuthDb());
    getAuth();
  });

  beforeEach(async () => {
    outbox.clear();
    await getRedis().flushdb();
    const db = getAuthDb();
    for (const name of ["user", "session", "account", "verification", "auditLogs"]) {
      await db.collection(name).deleteMany({});
    }
  });

  afterAll(async () => {
    await closeMongoClient();
    await disconnectFromDatabase();
    await closeRedis();
  });
}
