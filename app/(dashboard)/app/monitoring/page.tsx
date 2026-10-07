import type { Metadata } from "next";
import { Fingerprint } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { MonitoringForm } from "@/components/monitoring/monitoring-form";
import { MonitoringStatus } from "@/components/monitoring/monitoring-status";
import { ButtonLink } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/lib/auth/session";
import { listIdentities } from "@/server/services/identity/identity-service";
import { getMonitoringView } from "@/server/services/monitoring/monitoring-service";

export const metadata: Metadata = { title: "Monitoring" };

export default async function MonitoringPage() {
  const user = await requireUser();
  const verified = (await listIdentities(user.id)).filter((i) => i.verification === "verified");
  const views = await Promise.all(verified.map((i) => getMonitoringView(user.id, i.id)));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Monitoring"
        description="Re-check your verified addresses on a schedule. Each check asks the same sources as a manual scan. Turning monitoring off cancels scheduled checks that haven't started."
      />
      {verified.length === 0 ? (
        <EmptyState
          icon={Fingerprint}
          title="Verify an address first"
          description="Monitoring is available for addresses you've proven you own."
          action={<ButtonLink href="/app/identities">Go to identities</ButtonLink>}
        />
      ) : null}
      {verified.map((identity, index) => {
        const view = views[index];
        if (!view) return null;
        return (
          <Panel key={identity.id} aria-labelledby={`mon-${identity.id}`}>
            <PanelHeader
              id={`mon-${identity.id}`}
              title={<span className="font-mono">{identity.masked}</span>}
            />
            <PanelBody className="space-y-6">
              <MonitoringStatus
                state={view.state}
                lastScanAt={view.lastScanAt}
                nextScanAt={view.nextScanAt}
              />
              <MonitoringForm
                identityId={identity.id}
                enabled={view.state !== "off"}
                frequency={view.frequency}
              />
              <p className="text-xs text-fg-subtle">
                Email alerts for new findings are coming next. Until then, new results appear on your
                dashboard.
              </p>
            </PanelBody>
          </Panel>
        );
      })}
    </div>
  );
}
