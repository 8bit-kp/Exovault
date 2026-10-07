import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { ScanResults } from "@/components/scan/scan-results";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { isTerminalScanState } from "@/lib/domain/scan";
import { attributionsFor, listExposuresForUser } from "@/server/services/exposure/exposure-query";
import { getScanForUser } from "@/server/services/scan/scan-service";

export const metadata: Metadata = { title: "Your results" };

export default async function OnboardingResults({ searchParams }: PageProps<"/onboarding/results">) {
  const user = await requireUser();
  const { scan: scanId } = await searchParams;
  const scan = typeof scanId === "string" ? await getScanForUser(user.id, scanId) : null;
  if (!scan) redirect("/onboarding/scan");
  if (!isTerminalScanState(scan.state)) redirect(`/onboarding/scan?scan=${scan.id}`);

  const exposures = await listExposuresForUser(user.id, { identityId: scan.identityId });
  return (
    <OnboardingShell
      step="results"
      title={exposures.length > 0 ? `${exposures.length} exposures found` : "Your results"}
    >
      <ScanResults
        scan={scan}
        exposures={exposures}
        attributions={attributionsFor(exposures.flatMap((e) => e.providers))}
        flow="onboarding"
      />
      <ButtonLink href="/app/dashboard" className="mt-8 w-full">
        Go to dashboard
      </ButtonLink>
    </OnboardingShell>
  );
}
