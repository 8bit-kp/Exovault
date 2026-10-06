import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { AUTH_ROUTES } from "@/config/navigation";
import { getAuth } from "./server";

/**
 * Session lookup for Server Components and Server Actions. Every protected
 * page and action calls this itself (D-003); the proxy redirect is only a
 * convenience. `cache` dedupes it within one render.
 */
export const getSession = cache(async () => {
  return getAuth().api.getSession({ headers: await headers() });
});

export type AppSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;
export type SessionUser = AppSession["user"];

/** The signed-in, verified user's session, or a redirect to sign-in. */
export async function requireSession(): Promise<AppSession> {
  const session = await getSession();
  if (!session) redirect(AUTH_ROUTES.signIn);
  // Unverified users can't hold a session (requireEmailVerification), but check anyway.
  if (!session.user.emailVerified) redirect(AUTH_ROUTES.verifyEmail);
  return session;
}

export async function requireUser(): Promise<SessionUser> {
  return (await requireSession()).user;
}
