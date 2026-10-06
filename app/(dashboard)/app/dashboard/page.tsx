import type { Metadata } from "next";
import { Fingerprint } from "lucide-react";
import { SecurityScore } from "@/components/dashboard/security-score";
import { PageHeader } from "@/components/layout/page-header";
import { MonitoringStatus } from "@/components/monitoring/monitoring-status";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Dashboard" };

/** Honest pre-identity state: no score, monitoring off, one next step. Real data arrives in Phases 4–7. */
export default async function DashboardPage() {
  await requireUser();
  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" description="What the sources know about your verified identities." />
      <EmptyState
        icon={Fingerprint}
        title="Add the email address you want checked"
        description="You'll verify it first, so we only ever check addresses you control. Adding identities opens in the next update."
      />
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
    </div>
  );
}
