"use server";

import { redirect } from "next/navigation";
import { AUTH_ROUTES } from "@/config/navigation";
import { getRequestContext } from "@/lib/auth/request-context";
import { getSession } from "@/lib/auth/session";
import { cancelAccountDeletion } from "@/server/services/account/account-deletion-service";

/** Restores an account during its grace period. Monitoring stays off until the user turns it back on. */
export async function cancelDeletionAction(): Promise<void> {
  const session = await getSession();
  if (!session?.user.emailVerified) redirect(AUTH_ROUTES.signIn);
  await cancelAccountDeletion(session.user.id, await getRequestContext());
  // Whether or not there was anything to cancel, the app decides where this account belongs now.
  redirect("/app/dashboard?restored=1");
}
