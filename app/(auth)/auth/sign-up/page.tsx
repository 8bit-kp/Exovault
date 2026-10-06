import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { AccountsNotOpen } from "../accounts-not-open";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <AuthShell title="Create your account" description="You'll verify your email before any scan runs.">
      <AccountsNotOpen />
    </AuthShell>
  );
}
