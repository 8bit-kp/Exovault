import type { Metadata } from "next";
import { Fingerprint } from "lucide-react";
import { SecurityScore } from "@/components/dashboard/security-score";
import { IdentityCard } from "@/components/identity/identity-card";
import { PageHeader } from "@/components/layout/page-header";
import { MonitoringStatus } from "@/components/monitoring/monitoring-status";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DemoDataLabel } from "@/components/ui/demo-data-label";
import { ExposureList } from "@/components/exposure/exposure-list";
import { SourceAttribution } from "@/components/exposure/source-attribution";
import { LatestScanPanel } from "@/components/scan/latest-scan-panel";
import { attributionsFor, listExposuresForUser } from "@/server/services/exposure/exposure-query";
import { getLatestScan, manualScanAvailableIn } from "@/server/services/scan/scan-service";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/lib/auth/session";
import { listIdentities } from "@/server/services/identity/identity-service";

export const metadata: Metadata = { title: "Dashboard" };

/** Real identity and scan state. The risk score and full breakdown arrive in Phase 7. */
export default async function DashboardPage() {
  const user = await requireUser();
  const identities = await listIdentities(user.id);
  const verified = identities.find((i) => i.verification === "verified");
  const pending = identities.find((i) => i.verification === "pending");
  const exposures = await listExposuresForUser(user.id);

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" description="What the sources know about your verified identities." />

      {identities.length === 0 ? (
        <EmptyState
          icon={Fingerprint}
          title="Add the email address you want checked"
          description="You'll verify it first, so we only ever check addresses you control."
          action={<ButtonLink href="/onboarding/identity">Add an address</ButtonLink>}
        />
      ) : null}

      {pending && !verified ? (
        <Callout
          tone="warn"
          title="Finish verifying your address"
          action={
            <ButtonLink href={`/app/identities/${pending.id}`} size="sm" variant="secondary">
              Enter verification code
            </ButtonLink>
          }
        >
          We sent a code to {pending.masked}. Nothing is checked until it&apos;s verified.
        </Callout>
      ) : null}

      {verified ? (
        <LatestScanPanel
          identity={verified}
          scan={await getLatestScan(user.id, verified.id)}
          availableInSeconds={await manualScanAvailableIn(verified.id)}
        />
      ) : null}

      {exposures.length > 0 ? (
        <section aria-labelledby="recent-heading" className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="recent-heading" className="text-base font-semibold text-fg">
              Recent exposures
            </h2>
            {exposures.some((e) => e.isDemo) ? <DemoDataLabel /> : null}
          </div>
          <ExposureList label="Recent exposures" exposures={exposures.slice(0, 5)} empty={null} />
          <SourceAttribution attributions={attributionsFor(exposures.flatMap((e) => e.providers))} />
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Security status" />
          <PanelBody>
            <SecurityScore score={null} />
          </PanelBody>
        </Panel>
        <Panel>
          <PanelHeader title="Monitoring" />
          <PanelBody>
            <MonitoringStatus state="off" lastScanAt={null} nextScanAt={null} />
          </PanelBody>
        </Panel>
      </div>

      {identities.length > 0 ? (
        <section aria-labelledby="identities-heading" className="space-y-3">
          <h2 id="identities-heading" className="text-base font-semibold text-fg">
            Identities
          </h2>
          <ul className="grid gap-4 lg:grid-cols-2">
            {identities.map((identity) => (
              <li key={identity.id}>
                <IdentityCard
                  identity={identity}
                  action={
                    <ButtonLink href={`/app/identities/${identity.id}`} variant="secondary" size="sm">
                      Manage
                    </ButtonLink>
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
