import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { LiveScan } from "@/components/scan/live-scan";
import { StartScanForm } from "@/components/scan/scan-forms";
import { requireUser } from "@/lib/auth/session";
import { listIdentities } from "@/server/services/identity/identity-service";
import { getScanForUser, manualScanAvailableIn } from "@/server/services/scan/scan-service";

export const metadata: Metadata = { title: "First scan" };

export default async function OnboardingScan({ searchParams }: PageProps<"/onboarding/scan">) {
  const user = await requireUser();
  const verified = (await listIdentities(user.id)).find((i) => i.verification === "verified");
  if (!verified) redirect("/onboarding/identity");

  const { scan: scanId } = await searchParams;
  const scan = typeof scanId === "string" ? await getScanForUser(user.id, scanId) : null;

  if (scan) {
    return (
      <OnboardingShell
        step="scan"
        title="Scanning"
        description={
          <>
            Checking <span className="font-mono text-fg">{verified.masked}</span> against breach sources.
          </>
        }
      >
        <LiveScan initial={scan} flow="onboarding" resultsHref={`/onboarding/results?scan=${scan.id}`} />
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      step="scan"
      title="Ready for your first scan"
      description={
        <>
          <span className="font-mono text-fg">{verified.masked}</span> is verified. We&apos;ll send it to the
          breach sources we use, and keep only what they report about it.
        </>
      }
    >
      <StartScanForm
        identityId={verified.id}
        flow="onboarding"
        label="Start first scan"
        availableInSeconds={await manualScanAvailableIn(verified.id)}
      />
    </OnboardingShell>
  );
}
