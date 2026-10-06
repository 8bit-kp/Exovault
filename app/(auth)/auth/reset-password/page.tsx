import type { Metadata } from "next";
import { AUTH_ROUTES } from "@/config/navigation";
import { AuthLink } from "@/components/auth/auth-link";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { AuthShell } from "@/components/layout/auth-shell";
import { Callout } from "@/components/ui/callout";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: PageProps<"/auth/reset-password">) {
  const { token } = await searchParams;
  if (typeof token !== "string" || token.length < 16 || token.length > 512) {
    return (
      <AuthShell title="Reset link not valid">
        <Callout tone="warn" title="This link is incomplete or has expired.">
          Reset links work once and expire after 30 minutes.
        </Callout>
        <p className="mt-4 text-sm">
          <AuthLink href={AUTH_ROUTES.forgotPassword}>Request a new link</AuthLink>
        </p>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Choose a new password">
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
