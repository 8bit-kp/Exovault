import type { Metadata } from "next";
import { ExternalLink, EyeOff } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DATA_TYPE_LABELS, SOURCE_TYPE_LABELS } from "@/components/exposure/data-types";
import {
  ExposureChecklist,
  RemediationStatusControls,
  RevealSourceName,
} from "@/components/exposure/exposure-controls";
import { DETECTION_LABELS, REMEDIATION_LABELS } from "@/components/exposure/exposure-labels";
import { SeverityBadge } from "@/components/exposure/severity-badge";
import { SourceAttribution } from "@/components/exposure/source-attribution";
import { whyItMatters } from "@/components/exposure/why-it-matters";
import { Callout } from "@/components/ui/callout";
import { DemoDataLabel } from "@/components/ui/demo-data-label";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { Tag } from "@/components/ui/tag";
import { requireUser } from "@/lib/auth/session";
import { DISMISS_REASON_LABELS } from "@/lib/domain/remediation";
import { formatDate, isoString } from "@/lib/utils/format";
import { getExposureDetail } from "@/server/services/remediation/remediation-service";

// Never leak a source name (sensitive or not) into the browser tab title or history.
export const metadata: Metadata = { title: "Exposure" };

/**
 * Exposure detail (spec 13.6). Progressive disclosure: risk headline → what
 * happened → what was exposed → why it matters → what to do → technical
 * details. Raw leaked data is never shown; we never had it.
 */
export default async function ExposureDetailPage({ params }: PageProps<"/app/exposures/[id]">) {
  const user = await requireUser();
  const exposure = await getExposureDetail(user.id, (await params).id);
  if (!exposure) notFound();

  const closed = exposure.remediationState === "remediated" || exposure.remediationState === "dismissed";

  return (
    <article className="space-y-8">
      <Link href="/app/exposures" className="text-sm text-fg-muted hover:text-fg">
        ← All exposures
      </Link>

      {/* 1. Risk headline */}
      <header className="space-y-4 border-b border-line pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <SeverityBadge severity={exposure.severity} />
          <span className="rounded-sm border border-line px-2 py-0.5 text-xs text-fg-muted">
            {REMEDIATION_LABELS[exposure.remediationState]}
            {exposure.remediationState === "dismissed" && exposure.dismissReason
              ? `: ${DISMISS_REASON_LABELS[exposure.dismissReason]}`
              : ""}
          </span>
          {exposure.isDemo ? <DemoDataLabel /> : null}
        </div>
        <h1 className="flex flex-wrap items-center gap-2 text-3xl font-semibold text-fg">
          {exposure.sensitive ? <EyeOff aria-hidden className="size-6 text-fg-subtle" /> : null}
          {exposure.sourceName ?? <RevealSourceName exposureId={exposure.id} />}
        </h1>
        <p className="max-w-2xl text-lg text-fg-muted">{exposure.severityReason}.</p>
      </header>

      {exposure.detectionState === "no_longer_reported" ? (
        <Callout tone="info" title="The source no longer reports this.">
          That usually means the provider changed its records, not that the data was deleted. Your checklist
          still applies.
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          {/* 5. What to do (first in the main column: the action) */}
          <Panel aria-labelledby="todo-heading">
            <PanelHeader
              id="todo-heading"
              title="What to do"
              description={
                closed
                  ? "This is closed. Reopen it if something changes."
                  : "Each step is saved as you tick it, and lowers your risk score."
              }
            />
            <PanelBody className="space-y-6">
              <ExposureChecklist
                exposureId={exposure.id}
                items={exposure.checklist.map((i) => ({
                  id: i.key,
                  label: i.label,
                  description: i.description,
                  done: i.done,
                }))}
              />
              <RemediationStatusControls exposureId={exposure.id} state={exposure.remediationState} />
            </PanelBody>
          </Panel>

          {/* 4. Why it matters */}
          <Panel aria-labelledby="why-heading">
            <PanelHeader id="why-heading" title="Why it matters" />
            <PanelBody>
              <ul className="list-disc space-y-2 pl-5 text-sm text-fg-muted marker:text-fg-subtle">
                {whyItMatters(exposure.exposed, exposure.sourceType).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </PanelBody>
          </Panel>
        </div>

        <div className="space-y-6">
          {/* 2. What happened */}
          <Panel aria-labelledby="what-heading">
            <PanelHeader id="what-heading" title="What happened" />
            <PanelBody>
              <dl className="space-y-3 text-sm">
                <Row term="Source type" value={SOURCE_TYPE_LABELS[exposure.sourceType]} />
                <Row
                  term="Incident date"
                  value={
                    exposure.breachDate ? (
                      <time dateTime={isoString(exposure.breachDate)}>{formatDate(exposure.breachDate)}</time>
                    ) : (
                      "Not known"
                    )
                  }
                />
                <Row
                  term="First detected"
                  value={
                    <time dateTime={isoString(exposure.firstSeenAt)}>{formatDate(exposure.firstSeenAt)}</time>
                  }
                />
                <Row
                  term="Last reported"
                  value={
                    <time dateTime={isoString(exposure.lastSeenAt)}>{formatDate(exposure.lastSeenAt)}</time>
                  }
                />
                <Row term="Address" value={<span className="font-mono">{exposure.identityMasked}</span>} />
                <Row term="Reported by" value={exposure.providers.map((p) => p.displayName).join(", ")} />
                <Row term="Confidence" value={`${Math.round(exposure.confidence * 100)}%`} />
              </dl>
            </PanelBody>
          </Panel>

          {/* 3. What was exposed */}
          <Panel aria-labelledby="exposed-heading">
            <PanelHeader id="exposed-heading" title="What was exposed" />
            <PanelBody className="space-y-4">
              <div>
                <p className="eyebrow mb-2">Exposed</p>
                <ul className="flex flex-wrap gap-1.5" aria-label="Exposed data">
                  {exposure.exposed.map((t) => (
                    <li key={t}>
                      <Tag className="border-sev-high/40 text-fg">{DATA_TYPE_LABELS[t]}</Tag>
                    </li>
                  ))}
                </ul>
              </div>
              {exposure.notDetected.length > 0 ? (
                <div>
                  <p className="eyebrow mb-2">Not detected</p>
                  <ul className="flex flex-wrap gap-1.5" aria-label="Not detected">
                    {exposure.notDetected.map((t) => (
                      <li key={t}>
                        <Tag>{DATA_TYPE_LABELS[t]}</Tag>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-fg-subtle">
                    &ldquo;Not detected&rdquo; means the sources we checked didn&apos;t report it. It
                    doesn&apos;t prove it wasn&apos;t exposed.
                  </p>
                </div>
              ) : null}
            </PanelBody>
          </Panel>

          {/* 6. Technical details */}
          <details className="rounded-lg border border-line bg-surface-1 px-5 py-4 text-sm">
            <summary className="cursor-pointer font-medium text-fg">Technical details</summary>
            <dl className="mt-3 space-y-2 text-fg-muted">
              <Row term="Detection state" value={DETECTION_LABELS[exposure.detectionState]} />
              <Row term="Severity rule" value={exposure.severityReason} />
            </dl>
            {exposure.evidenceReferences.length > 0 ? (
              <ul className="mt-3 space-y-1">
                {exposure.evidenceReferences.map((href) => (
                  <li key={href}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-accent underline-offset-4 hover:underline"
                    >
                      Provider&apos;s public page about this incident{" "}
                      <ExternalLink aria-hidden className="size-3" />
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-3 text-xs text-fg-subtle">
              We store which kinds of data were exposed, never the leaked values themselves.
            </p>
          </details>
          <SourceAttribution attributions={exposure.attributions} />
        </div>
      </div>
    </article>
  );
}

function Row({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-fg-subtle">{term}</dt>
      <dd className="text-fg sm:text-right">{value}</dd>
    </div>
  );
}
