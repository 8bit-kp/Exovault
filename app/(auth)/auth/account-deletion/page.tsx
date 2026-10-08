import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ExportDataButton } from "@/components/account/privacy-controls";
import { SignOutButton } from "@/components/account/sign-out-button";
import { SubmitButton } from "@/components/auth/form-parts";
import { AuthShell } from "@/components/layout/auth-shell";
import { AUTH_ROUTES } from "@/config/navigation";
import { getSession, getSessionDeletion } from "@/lib/auth/session";
import { getPreferences } from "@/server/services/notification/notification-service";
import { formatDateTime } from "@/lib/utils/format";
import { cancelDeletionAction } from "./actions";

export const metadata: Metadata = { title: "Account scheduled for deletion", robots: { index: false } };

/**
 * Where a signed-in account with a pending deletion lands (requireSession sends it here).
 * It can be restored, or its data downloaded one last time; nothing else.
 */
export default async function AccountDeletionPage() {
  const session = await getSession();
  if (!session?.user.emailVerified) redirect(AUTH_ROUTES.signIn);
  const pending = await getSessionDeletion(session.user.id);
  if (!pending) redirect("/app/dashboard");
  const { timezone } = await getPreferences(session.user.id);
  return (
    <AuthShell
      title="Your account is scheduled for deletion"
      description={
        <>
          It will be permanently deleted on{" "}
          <time dateTime={pending.purgeAfter.toISOString()} className="font-medium text-fg">
            {formatDateTime(pending.purgeAfter, { timeZone: timezone })}
          </time>
          . Until then monitoring is off and no alerts are sent.
        </>
      }
      footer={<SignOutButton />}
    >
      <div className="space-y-6">
        <form action={cancelDeletionAction}>
          <SubmitButton pendingLabel="Restoring…">Keep my account</SubmitButton>
        </form>
        <div className="space-y-2 border-t border-line pt-6">
          <p className="text-sm text-fg-muted">Want a copy of your data before it goes?</p>
          <ExportDataButton />
        </div>
      </div>
    </AuthShell>
  );
}
