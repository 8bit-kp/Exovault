import type { Metadata } from "next";
import { AUTH_ROUTES } from "@/config/navigation";
import { AuthLink } from "@/components/auth/auth-link";
import { VerifyEmailForm } from "@/components/auth/auth-forms";
import { AuthShell } from "@/components/layout/auth-shell";
import { Callout } from "@/components/ui/callout";
import { getPendingVerification } from "@/lib/auth/pending-verification";
import { maskEmail } from "@/lib/utils/mask";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage() {
  const email = await getPendingVerification();
  if (!email) {
    return (
      <AuthShell title="Verify your email">
        <Callout tone="info" title="There's no verification in progress on this device.">
          Sign in with your email and password and we&apos;ll send a fresh code.
        </Callout>
        <p className="mt-4 text-sm">
          <AuthLink href={AUTH_ROUTES.signIn}>Go to sign in</AuthLink>
        </p>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title="Check your inbox"
      description={
        <>
          If <span className="font-mono text-fg">{maskEmail(email)}</span> is new to us, we&apos;ve sent it a
          6-digit code. Enter it below to finish creating your account.
        </>
      }
      footer={
        <>
          Wrong address? <AuthLink href={AUTH_ROUTES.signUp}>Start again</AuthLink>
        </>
      }
    >
      <VerifyEmailForm />
    </AuthShell>
  );
}
