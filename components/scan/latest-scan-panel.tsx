import Link from "next/link";
import type { IdentityView } from "@/components/identity/identity-card";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { isTerminalScanState } from "@/lib/domain/scan";
import { formatDateTime, isoString } from "@/lib/utils/format";
import type { ScanView } from "@/server/services/scan/scan-service";
import { StartScanForm } from "./scan-forms";

const STATE_LABEL: Record<string, string> = {
  completed: "Completed",
  partial: "Completed with gaps",
  failed: "Failed",
};

/** Latest scan for one identity plus the next action (run / wait for cooldown / watch progress). */
export function LatestScanPanel({
  identity,
  scan,
  availableInSeconds,
}: {
  identity: IdentityView;
  scan: ScanView | null;
  availableInSeconds: number;
}) {
  const running = scan && !isTerminalScanState(scan.state);
  return (
    <Panel>
      <PanelHeader title="Latest scan" description={<span className="font-mono">{identity.masked}</span>} />
      <PanelBody className="space-y-4">
        {scan ? (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-fg-subtle">Status</dt>
              <dd className="text-fg">{running ? "In progress" : STATE_LABEL[scan.state]}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-subtle">Started</dt>
              <dd className="font-mono text-xs text-fg">
                <time dateTime={isoString(scan.createdAt)}>{formatDateTime(scan.createdAt)}</time>
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-fg-muted">This address hasn&apos;t been scanned yet.</p>
        )}
        {running ? (
          <Link
            href={`/app/scans/${scan.id}`}
            className="text-sm text-accent underline-offset-4 hover:underline"
          >
            Watch progress
          </Link>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <StartScanForm
              identityId={identity.id}
              flow="app"
              label={scan ? "Scan again" : "Run first scan"}
              availableInSeconds={availableInSeconds}
            />
            {scan ? (
              <Link
                href={`/app/scans/${scan.id}`}
                className="text-sm text-accent underline-offset-4 hover:underline"
              >
                View last results
              </Link>
            ) : null}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}
