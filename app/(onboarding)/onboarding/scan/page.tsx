import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { requireUser } from "@/lib/auth/session";
import { listIdentities } from "@/server/services/identity/identity-service";

export const metadata: Metadata = { title: "First scan" };

/** Honest placeholder: scanning is built in Phase 6. */
export default async function OnboardingScan() {
  const user = await requireUser();
  const verified = (await listIdentities(user.id)).find((i) => i.verification === "verified");
  if (!verified) redirect("/onboarding/identity");
  return (
    <OnboardingShell
      step="scan"
      title="Address verified"
      description={
        <>
          <span className="font-mono text-fg">{verified.masked}</span> is verified and ready to check.
        </>
      }
    >
      <Callout tone="info" title="Scanning isn't available yet.">
        The scan engine is being built now. When it ships, you&apos;ll start your first scan from here and on
        the dashboard. Nothing has been checked so far.
      </Callout>
      <ButtonLink href="/app/dashboard" className="mt-6 w-full">
        Go to dashboard
      </ButtonLink>
    </OnboardingShell>
  );
}
