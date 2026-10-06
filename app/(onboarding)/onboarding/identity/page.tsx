import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AddIdentityForm, VerifyIdentityForm } from "@/components/identity/identity-forms";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { requireUser } from "@/lib/auth/session";
import { maskEmail } from "@/lib/utils/mask";
import { listIdentities } from "@/server/services/identity/identity-service";

export const metadata: Metadata = { title: "Choose the address to check" };

export default async function OnboardingIdentity() {
  const user = await requireUser();
  const identities = await listIdentities(user.id);
  if (identities.some((i) => i.verification === "verified")) redirect("/onboarding/scan");

  const pending = identities.find((i) => i.verification === "pending");
  if (pending) {
    return (
      <OnboardingShell
        step="identity"
        title="Check that inbox"
        description={
          <>
            We sent a 6-digit code to <span className="font-mono text-fg">{pending.masked}</span>. Entering it
            proves the address is yours. We never check an address until it&apos;s verified.
          </>
        }
      >
        <VerifyIdentityForm identityId={pending.id} flow="onboarding" />
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      step="identity"
      title="Which address should we check?"
      description="You can only check addresses you control. That stops anyone using this to look up someone else."
    >
      <AddIdentityForm flow="onboarding" accountEmailMasked={maskEmail(user.email)} />
    </OnboardingShell>
  );
}
