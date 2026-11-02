import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AUTH_ROUTES } from "@/config/navigation";
import { AuthLink } from "@/components/auth/auth-link";
import { SignInForm } from "@/components/auth/auth-forms";
import { AuthShell } from "@/components/layout/auth-shell";
import { Callout } from "@/components/ui/callout";
import { getSession } from "@/lib/auth/session";
import { safeReturnTo } from "@/lib/security/redirect";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/auth/sign-in">) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.returnTo);
  if (await getSession()) redirect(returnTo);
  return (
    <AuthShell
      title="Sign in"
      footer={
        <>
          New here? <AuthLink href={AUTH_ROUTES.signUp}>Create an account</AuthLink>
        </>
      }
    >
      {params.deleted === "1" ? (
        <Callout tone="info" role="status" title="Your account is scheduled for deletion." className="mb-4">
          We emailed you the date. Sign in before then if you want to keep it.
        </Callout>
      ) : null}
      {params.reset === "1" ? (
        <Callout
          tone="ok"
          role="status"
          title="Password changed. Sign in with your new password."
          className="mb-4"
        />
      ) : null}
      <SignInForm returnTo={returnTo} />
    </AuthShell>
  );
}
