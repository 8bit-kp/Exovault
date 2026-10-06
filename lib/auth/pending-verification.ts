import "server-only";
import { cookies } from "next/headers";
import { getEnv } from "@/config/env";
import { seal, unseal } from "@/lib/crypto/sealed";
import { sessionCookieConfig } from "./cookies";

/**
 * Carries "which address are we verifying" from sign-up/sign-in to the
 * verification page without putting the email in a URL (spec 5.1).
 */
const PURPOSE = "pending-verification";
const TTL_SECONDS = 15 * 60;

function cookieName(): string {
  return `${sessionCookieConfig(getEnv().APP_URL).prefix}.pending_verification`;
}

export async function setPendingVerification(email: string): Promise<void> {
  const { secure } = sessionCookieConfig(getEnv().APP_URL);
  (await cookies()).set(cookieName(), seal(PURPOSE, { email }, TTL_SECONDS), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function getPendingVerification(): Promise<string | null> {
  const value = (await cookies()).get(cookieName())?.value;
  return unseal<{ email: string }>(PURPOSE, value)?.email ?? null;
}

export async function clearPendingVerification(): Promise<void> {
  (await cookies()).delete(cookieName());
}
