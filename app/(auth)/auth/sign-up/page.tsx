import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AUTH_ROUTES } from "@/config/navigation";
import { AuthLink } from "@/components/auth/auth-link";
import { SignUpForm } from "@/components/auth/auth-forms";
import { AuthShell } from "@/components/layout/auth-shell";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage() {
  if (await getSession()) redirect("/app/dashboard");
  return (
    <AuthShell
      title="Create your account"
      description="You'll confirm your email with a one-time code. We only ever check addresses you've proven are yours."
      footer={
        <>
          Already have an account? <AuthLink href={AUTH_ROUTES.signIn}>Sign in</AuthLink>
        </>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
