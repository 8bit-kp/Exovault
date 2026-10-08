import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, Fingerprint } from "lucide-react";
import { ScoreExplainer } from "@/components/dashboard/score-explainer";
import { SecurityEvent } from "@/components/dashboard/security-event";
import { SecurityScore } from "@/components/dashboard/security-score";
import { SeverityBreakdown } from "@/components/dashboard/severity-breakdown";
import { ExposureList } from "@/components/exposure/exposure-list";
import { RecommendationCard } from "@/components/exposure/recommendation-card";
import { SourceAttribution } from "@/components/exposure/source-attribution";
import { PageHeader } from "@/components/layout/page-header";
import { MonitoringStatus } from "@/components/monitoring/monitoring-status";
import { LatestScanPanel } from "@/components/scan/latest-scan-panel";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DemoDataLabel } from "@/components/ui/demo-data-label";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/lib/auth/session";
import { isActiveExposure } from "@/lib/domain/exposure";
import { listRecentActivity } from "@/server/services/activity/activity-service";
import {
  activeSeverityCounts,
  attributionsFor,
  listExposuresForUser,
} from "@/server/services/exposure/exposure-query";
import { listIdentities } from "@/server/services/identity/identity-service";
import { getRecommendedActions } from "@/server/services/remediation/recommendations";
import { getRiskScores } from "@/server/services/risk/risk-service";
import { getMonitoringView } from "@/server/services/monitoring/monitoring-service";
import { getLatestScan, manualScanAvailableIn } from "@/server/services/scan/scan-service";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * "Am I exposed?" within seconds (spec 13.5): risk headline first, then what
 * to do, then detail. Every number comes from persisted state.
 */
export default async function DashboardPage({ searchParams }: PageProps<"/app/dashboard">) {
  const user = await requireUser();
  const restored = (await searchParams).restored === "1";
  const [identities, exposures, counts, risk, activity] = await Promise.all([
    listIdentities(user.id),
    listExposuresForUser(user.id),
    activeSeverityCounts(user.id),
    getRiskScores(user.id),
    listRecentActivity(user.id),
  ]);
  const verified = identities.find((i) => i.verification === "verified");
  const pending = identities.find((i) => i.verification === "pending");
  const latestScan = verified ? await getLatestScan(user.id, verified.id) : null;
  const monitoring = verified ? await getMonitoringView(user.id, verified.id) : null;
  const hasScanned = Boolean(risk.current) || Boolean(latestScan);
  const active = exposures.filter(isActiveExposure);
  const anyDemo = exposures.some((e) => e.isDemo) || Boolean(latestScan?.isDemo);
  const recommendations = getRecommendedActions({
    hasIdentity: identities.length > 0,
    hasVerifiedIdentity: Boolean(verified),
    hasScanned,
    exposures,
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="What the sources know about your verified identities, and what to do next."
        action={anyDemo ? <DemoDataLabel /> : undefined}
      />

      {restored ? (
        <Callout
          tone="ok"
          role="status"
          title="Your account is no longer scheduled for deletion."
          action={
            <Link href="/app/monitoring" className="text-sm text-accent underline underline-offset-4">
              Turn monitoring back on
            </Link>
          }
        >
          Monitoring stayed off while deletion was pending. Turn it back on if you want scheduled checks.
        </Callout>
      ) : null}

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

      {hasScanned && exposures.length > 0 && active.length === 0 ? (
        <Callout tone="ok" title="Everything known is handled">
          All exposures we know about are marked as fixed or dismissed. We&apos;ll keep reporting what the
          sources know; scan again any time.
        </Callout>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Panel aria-labelledby="status-heading">
          <PanelHeader id="status-heading" title="Security status" />
          <PanelBody className="space-y-5">
            <SecurityScore score={risk.current?.score ?? null} previousScore={risk.previous?.score ?? null} />
            {risk.current ? (
              <ScoreExplainer
                factors={risk.current.factors}
                methodologyVersion={risk.current.methodologyVersion}
              />
            ) : null}
          </PanelBody>
        </Panel>
        <div className="space-y-4">
          <Panel aria-labelledby="exposures-heading">
            <PanelHeader id="exposures-heading" title="Active exposures" />
            <PanelBody>
              <SeverityBreakdown counts={counts} />
            </PanelBody>
          </Panel>
          <Panel aria-labelledby="monitoring-heading">
            <PanelHeader id="monitoring-heading" title="Monitoring" />
            <PanelBody>
              <MonitoringStatus
                state={monitoring?.state ?? "off"}
                lastScanAt={monitoring?.lastScanAt ?? latestScan?.finishedAt ?? null}
                nextScanAt={monitoring?.nextScanAt ?? null}
              />
            </PanelBody>
          </Panel>
        </div>
      </div>

      {recommendations.length > 0 ? (
        <section aria-labelledby="actions-heading" className="space-y-3">
          <h2 id="actions-heading" className="text-base font-semibold text-fg">
            Recommended actions
          </h2>
          <ul className="space-y-2">
            {recommendations.map((r) => (
              <li key={r.key}>
                <RecommendationCard
                  title={r.title}
                  reason={r.reason}
                  priority={r.priority}
                  action={r.action}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {verified ? (
        <LatestScanPanel
          identity={verified}
          scan={latestScan}
          availableInSeconds={await manualScanAvailableIn(user.id, verified.id)}
        />
      ) : null}

      {exposures.length > 0 ? (
        <section aria-labelledby="recent-heading" className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="recent-heading" className="text-base font-semibold text-fg">
              Recent exposures
            </h2>
            <Link href="/app/exposures" className="text-sm text-accent underline-offset-4 hover:underline">
              View all {exposures.length}
            </Link>
          </div>
          <ExposureList
            label="Recent exposures"
            exposures={exposures.slice(0, 5)}
            empty={null}
            hrefFor={(e) => `/app/exposures/${e.id}`}
          />
          <SourceAttribution attributions={attributionsFor(exposures.flatMap((e) => e.providers))} />
        </section>
      ) : hasScanned && verified ? (
        <EmptyState
          icon={CircleCheck}
          title="No known exposures detected"
          description="Nothing was found in the sources we checked. That isn't a guarantee: sources only know about breaches reported to them."
        />
      ) : null}

      {activity.length > 0 ? (
        <Panel aria-labelledby="activity-heading">
          <PanelHeader id="activity-heading" title="Recent activity" />
          <ol className="divide-y divide-line px-5">
            {activity.map((item) => (
              <li key={item.id}>
                <SecurityEvent kind={item.kind} at={item.at} detail={item.detail} />
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}
    </div>
  );
}
