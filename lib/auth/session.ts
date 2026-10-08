import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { AUTH_ROUTES } from "@/config/navigation";
import { getPendingDeletion } from "@/server/services/account/account-deletion-service";
import { getPreferences } from "@/server/services/notification/notification-service";
import { setRequestTimeZone } from "./request-timezone";
import { getAuth } from "./server";

/**
 * Session lookup for Server Components and Server Actions. Every protected
 * page and action calls this itself (D-003); the proxy redirect is only a
 * convenience. `cache` dedupes it within one render.
 */
export const getSession = cache(async () => {
  return getAuth().api.getSession({ headers: await headers() });
});

/** The account's pending deletion, if any (one indexed lookup, deduped per request). */
export const getSessionDeletion = cache(async (userId: string) => getPendingDeletion(userId));

export type AppSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;
export type SessionUser = AppSession["user"];

/** The signed-in, verified user's session, or a redirect to sign-in. */
export async function requireSession(): Promise<AppSession> {
  const session = await getSession();
  if (!session) redirect(AUTH_ROUTES.signIn);
  // Unverified users can't hold a session (requireEmailVerification), but check anyway.
  if (!session.user.emailVerified) redirect(AUTH_ROUTES.verifyEmail);
  // An account scheduled for deletion is frozen: the only place it can go is the page that restores it.
  if (await getSessionDeletion(session.user.id)) redirect(AUTH_ROUTES.accountDeletion);
  // Every page and action that shows times calls this first: set the display timezone for the request.
  setRequestTimeZone((await getPreferences(session.user.id)).timezone);
  return session;
}

export async function requireUser(): Promise<SessionUser> {
  return (await requireSession()).user;
}
