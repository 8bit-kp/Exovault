import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { LiveScan } from "@/components/scan/live-scan";
import { ScanResults } from "@/components/scan/scan-results";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { requireUser } from "@/lib/auth/session";
import { isTerminalScanState } from "@/lib/domain/scan";
import { attributionsFor, listExposuresForUser } from "@/server/services/exposure/exposure-query";
import { getIdentity } from "@/server/services/identity/identity-service";
import { getScanForUser } from "@/server/services/scan/scan-service";

export const metadata: Metadata = { title: "Scan" };

export default async function ScanPage({ params }: PageProps<"/app/scans/[id]">) {
  const user = await requireUser();
  const scan = await getScanForUser(user.id, (await params).id);
  if (!scan) notFound();
  const identity = await getIdentity(user.id, scan.identityId);
  const done = isTerminalScanState(scan.state);
  const exposures = done ? await listExposuresForUser(user.id, { identityId: scan.identityId }) : [];

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={identity?.masked} title={done ? "Scan results" : "Scanning"} />
      <Panel>
        <PanelHeader title="Progress" />
        <PanelBody>
          <LiveScan initial={scan} flow="app" resultsHref="#results" />
        </PanelBody>
      </Panel>
      {done ? (
        <section id="results" aria-labelledby="results-heading" className="scroll-mt-20 space-y-4">
          <h2 id="results-heading" className="text-lg font-semibold">
            What we found
          </h2>
          <ScanResults
            scan={scan}
            exposures={exposures}
            attributions={attributionsFor(exposures.flatMap((e) => e.providers))}
            flow="app"
          />
        </section>
      ) : null}
    </div>
  );
}
