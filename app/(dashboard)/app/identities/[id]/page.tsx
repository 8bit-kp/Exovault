import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  RemoveIdentityButton,
  RevealIdentity,
  VerifyIdentityForm,
} from "@/components/identity/identity-forms";
import { PageHeader } from "@/components/layout/page-header";
import { MonitoringStatus } from "@/components/monitoring/monitoring-status";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { requireUser } from "@/lib/auth/session";
import { getIdentity } from "@/server/services/identity/identity-service";
import { LatestScanPanel } from "@/components/scan/latest-scan-panel";
import { getLatestScan, manualScanAvailableIn } from "@/server/services/scan/scan-service";

export const metadata: Metadata = { title: "Identity" };

export default async function IdentityDetailPage({ params }: PageProps<"/app/identities/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  // Scoped by user: someone else's identity is a plain 404 (spec 12.1).
  const identity = await getIdentity(user.id, id);
  if (!identity) notFound();

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Email address"
        title={identity.verification === "verified" ? "Verified identity" : "Verify this address"}
      />
      <Panel>
        <PanelHeader
          title="Address"
          description="Stored encrypted. Revealing it is recorded in your account's audit log."
        />
        <PanelBody>
          <RevealIdentity identityId={identity.id} masked={identity.masked} />
        </PanelBody>
      </Panel>
      {identity.verification === "pending" ? (
        <Panel>
          <PanelHeader
            title="Enter the code we emailed to this address"
            description="Nothing is checked until the address is verified."
          />
          <PanelBody className="max-w-sm">
            <VerifyIdentityForm identityId={identity.id} flow="app" />
          </PanelBody>
        </Panel>
      ) : (
        <>
          <LatestScanPanel
            identity={identity}
            scan={await getLatestScan(user.id, identity.id)}
            availableInSeconds={await manualScanAvailableIn(identity.id)}
          />
          <Panel>
            <PanelHeader title="Monitoring" />
            <PanelBody>
              <MonitoringStatus state="off" lastScanAt={identity.lastScanAt} nextScanAt={null} />
            </PanelBody>
          </Panel>
        </>
      )}
      <Panel>
        <PanelHeader
          title="Remove"
          description="Deletes the encrypted address and stops all checks for it."
        />
        <PanelBody>
          <RemoveIdentityButton identityId={identity.id} />
        </PanelBody>
      </Panel>
    </div>
  );
}
