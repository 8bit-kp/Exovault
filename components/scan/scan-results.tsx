import { ShieldCheck } from "lucide-react";
import { SeverityBreakdown } from "@/components/dashboard/severity-breakdown";
import { ExposureList } from "@/components/exposure/exposure-list";
import { SourceAttribution } from "@/components/exposure/source-attribution";
import type { ExposureView } from "@/components/exposure/types";
import { Callout } from "@/components/ui/callout";
import { DemoDataLabel } from "@/components/ui/demo-data-label";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { formatDateTime } from "@/lib/utils/format";
import { pluralize } from "@/lib/utils/format";
import type { ScanView } from "@/server/services/scan/scan-service";
import { RetryFailedSourcesForm } from "./scan-forms";

const FAILURE_COPY: Record<string, string> = {
  all_sources_failed: "None of the sources could be reached, so nothing was checked.",
  interrupted: "The scan was interrupted before it finished, so nothing was checked.",
  internal: "Something went wrong on our side while scanning.",
};

/**
 * What a finished scan found, in the order spec 13.1 asks for: headline,
 * what was checked, what was found. Absence of results is stated as "not
 * found in the sources we checked", never as safety.
 */
export function ScanResults({
  scan,
  exposures,
  attributions,
  flow,
}: {
  scan: ScanView;
  exposures: ExposureView[];
  attributions: Array<{ name: string; url: string }>;
  flow: "onboarding" | "app";
}) {
  const checked = scan.providers.filter((p) => p.state === "ok");
  const failed = scan.providers.filter((p) => p.state === "error");
  const when = scan.finishedAt ? formatDateTime(scan.finishedAt) : formatDateTime(scan.createdAt);
  const anyDemo = scan.isDemo || exposures.some((e) => e.isDemo);

  if (scan.state === "failed") {
    return (
      <ErrorState
        title="The scan couldn't be completed"
        description={`${FAILURE_COPY[scan.failureReason ?? "internal"]} Your existing results haven't changed.`}
        action={failed.length > 0 ? <RetryFailedSourcesForm scanId={scan.id} flow={flow} /> : undefined}
      />
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-fg-muted">
        Checked {pluralize(checked.length, "source")} ({checked.map((p) => p.displayName).join(", ")}) on{" "}
        {when}.
        {anyDemo ? (
          <span className="ml-2 inline-flex align-middle">
            <DemoDataLabel />
          </span>
        ) : null}
      </p>

      {scan.state === "partial" ? (
        <Callout
          tone="warn"
          title={`${checked.length} of ${checked.length + failed.length} sources responded. Results may be incomplete.`}
          action={<RetryFailedSourcesForm scanId={scan.id} flow={flow} />}
        >
          {failed.map((p) => p.displayName).join(", ")} couldn&apos;t be checked, so it can&apos;t confirm or
          rule anything out.
        </Callout>
      ) : null}

      {exposures.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No known exposures detected"
          description={`Not found in the ${pluralize(checked.length, "source")} checked on ${when}. That isn't a guarantee: sources only know about breaches that were reported to them. Monitoring is off; scan again any time.`}
        />
      ) : (
        <>
          <SeverityBreakdown counts={scan.summary.activeBySeverity} />
          <ExposureList
            label="Exposures found"
            exposures={exposures}
            empty={null}
            hrefFor={(e) => `/app/exposures/${e.id}`}
          />
        </>
      )}

      <SourceAttribution attributions={attributions} />
    </div>
  );
}
