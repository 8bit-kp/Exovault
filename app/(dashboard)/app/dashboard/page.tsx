import type { Metadata } from "next";
import { Fingerprint } from "lucide-react";
import { SecurityScore } from "@/components/dashboard/security-score";
import { IdentityCard } from "@/components/identity/identity-card";
import { PageHeader } from "@/components/layout/page-header";
import { MonitoringStatus } from "@/components/monitoring/monitoring-status";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/lib/auth/session";
import { listIdentities } from "@/server/services/identity/identity-service";

export const metadata: Metadata = { title: "Dashboard" };

/** Real identity state; no score or exposures until scanning exists (Phases 5–7). */
export default async function DashboardPage() {
  const user = await requireUser();
  const identities = await listIdentities(user.id);
  const verified = identities.find((i) => i.verification === "verified");
  const pending = identities.find((i) => i.verification === "pending");

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
        <Callout tone="info" title="Scanning isn't available yet.">
          {verified.masked} is verified. The scan engine is being built now; nothing has been checked so far.
        </Callout>
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
