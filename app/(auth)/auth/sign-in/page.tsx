import type { Metadata } from "next";
import { AuthShell } from "@/components/layout/auth-shell";
import { AccountsNotOpen } from "../accounts-not-open";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthShell title="Sign in">
      <AccountsNotOpen />
    </AuthShell>
  );
}
