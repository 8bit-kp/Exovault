import type { Metadata } from "next";
import { ScanLine } from "lucide-react";
import { ExposureList } from "@/components/exposure/exposure-list";
import { SourceAttribution } from "@/components/exposure/source-attribution";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { DemoDataLabel } from "@/components/ui/demo-data-label";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/lib/auth/session";
import { attributionsFor, listExposuresForUser } from "@/server/services/exposure/exposure-query";

export const metadata: Metadata = { title: "Exposures" };

/** All of the user's exposures, most urgent first. Filters, grouping and detail pages arrive in Phases 7–8. */
export default async function ExposuresPage() {
  const user = await requireUser();
  const exposures = await listExposuresForUser(user.id);
  return (
    <div className="space-y-8">
      <PageHeader
        title="Exposures"
        description="Every finding for your verified identities, most urgent first."
        action={exposures.some((e) => e.isDemo) ? <DemoDataLabel /> : undefined}
      />
      <ExposureList
        hrefFor={(e) => `/app/exposures/${e.id}`}
        label="Exposures"
        exposures={exposures}
        empty={
          <EmptyState
            icon={ScanLine}
            title="No exposures recorded"
            description="Either you haven't scanned yet, or the sources we checked had nothing for your verified addresses. That isn't a guarantee of safety."
            action={<ButtonLink href="/app/dashboard">Go to dashboard</ButtonLink>}
          />
        }
      />
      <SourceAttribution attributions={attributionsFor(exposures.flatMap((e) => e.providers))} />
    </div>
  );
}
