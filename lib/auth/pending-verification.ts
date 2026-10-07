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

export interface PendingVerification {
  email: string;
  /** Signup-binding nonce (D-034); null when this browser isn't bound to the account. */
  nonce: string | null;
}

export async function setPendingVerification(email: string, nonce: string | null): Promise<void> {
  const { secure } = sessionCookieConfig(getEnv().APP_URL);
  (await cookies()).set(cookieName(), seal(PURPOSE, { email, nonce }, TTL_SECONDS), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function getPendingVerification(): Promise<PendingVerification | null> {
  const value = (await cookies()).get(cookieName())?.value;
  const payload = unseal<PendingVerification>(PURPOSE, value);
  return payload && typeof payload.email === "string"
    ? { email: payload.email, nonce: payload.nonce ?? null }
    : null;
}

/**
 * Clears with the same attributes it was set with: browsers ignore a
 * `__Host-` Set-Cookie that lacks Secure, so a bare delete() would silently fail.
 */
export async function clearPendingVerification(): Promise<void> {
  const { secure } = sessionCookieConfig(getEnv().APP_URL);
  (await cookies()).set(cookieName(), "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
}
