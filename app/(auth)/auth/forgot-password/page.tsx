import type { Metadata } from "next";
import { AUTH_ROUTES } from "@/config/navigation";
import { AuthLink } from "@/components/auth/auth-link";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";
import { AuthShell } from "@/components/layout/auth-shell";
import { DemoAuthClosed } from "@/components/auth/demo-notices";
import { isDemoMode } from "@/config/demo";

export const metadata: Metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  if (isDemoMode()) return <DemoAuthClosed title="Password reset is off in the demo" />;
  return (
    <AuthShell
      title="Reset your password"
      description="Enter your account's email address and we'll send a link to choose a new password."
      footer={
        <>
          Remembered it? <AuthLink href={AUTH_ROUTES.signIn}>Sign in</AuthLink>
        </>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
