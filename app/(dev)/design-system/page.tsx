import Link from "next/link";
import { RefreshCw, ScanLine } from "lucide-react";
import type { ReactNode } from "react";
import { RiskBadge } from "@/components/dashboard/risk-badge";
import { SecurityEvent } from "@/components/dashboard/security-event";
import { SecurityScore } from "@/components/dashboard/security-score";
import { SeverityBreakdown } from "@/components/dashboard/severity-breakdown";
import { ExposureList } from "@/components/exposure/exposure-list";
import { ExposureTimeline } from "@/components/exposure/exposure-timeline";
import { RecommendationCard } from "@/components/exposure/recommendation-card";
import { SeverityBadge } from "@/components/exposure/severity-badge";
import { IdentityCard } from "@/components/identity/identity-card";
import { PageHeader } from "@/components/layout/page-header";
import { MonitoringStatus } from "@/components/monitoring/monitoring-status";
import { ScanProgress } from "@/components/monitoring/scan-progress";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DemoDataLabel } from "@/components/ui/demo-data-label";
import { Field, Input } from "@/components/ui/field";
import { Logo } from "@/components/ui/logo";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { AccessState, EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Tag } from "@/components/ui/tag";
import { EXPOSURE_SEVERITIES } from "@/lib/domain/exposure";
import { RISK_BANDS } from "@/lib/domain/risk";
import { EXAMPLE_EXPOSURES } from "@/lib/demo/examples";
import { ChecklistDemo } from "./_components/checklist-demo";

/**
 * Living reference for the design system (D-016). Renders real components
 * with fictional data; every data-bearing block is labelled "Demo data".
 */
export default function DesignSystemPage() {
  const exposureHref = () => "/design-system#exposures";
  return (
    <main id="main" className="mx-auto max-w-6xl space-y-16 px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="rounded-sm">
          <Logo />
        </Link>
        <DemoDataLabel />
      </div>
      <PageHeader
        eyebrow="Reference"
        title="Design system"
        description="Tokens and components as they render in the product. All data on this page is fictional."
        action={
          <div className="flex gap-2">
            <ButtonLink href="/design-system/app-shell" variant="secondary" size="sm">
              App shell
            </ButtonLink>
            <ButtonLink href="/design-system/auth-shell" variant="secondary" size="sm">
              Auth shell
            </ButtonLink>
          </div>
        }
      />

      <Block id="tokens" title="Colour tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <Swatch className="bg-bg" name="bg" />
          <Swatch className="bg-surface-1" name="surface-1" />
          <Swatch className="bg-surface-2" name="surface-2" />
          <Swatch className="bg-surface-3" name="surface-3" />
          <Swatch className="bg-line" name="line" />
          <Swatch className="bg-line-strong" name="line-strong" />
          <Swatch className="bg-fg" name="fg" />
          <Swatch className="bg-fg-muted" name="fg-muted" />
          <Swatch className="bg-fg-subtle" name="fg-subtle" />
          <Swatch className="bg-accent" name="accent" />
          <Swatch className="bg-ok" name="ok" />
          <Swatch className="bg-warn" name="warn" />
          <Swatch className="bg-sev-critical" name="sev-critical" />
          <Swatch className="bg-sev-high" name="sev-high" />
          <Swatch className="bg-sev-medium" name="sev-medium" />
          <Swatch className="bg-sev-low" name="sev-low" />
          <Swatch className="bg-sev-info" name="sev-info" />
        </div>
      </Block>

      <Block id="type" title="Typography">
        <div className="space-y-4">
          <p className="text-6xl font-semibold tracking-tight">Display 6xl</p>
          <p className="text-4xl font-semibold">Heading 4xl</p>
          <p className="text-2xl font-semibold">Heading 2xl</p>
          <p className="text-lg text-fg-muted">Lead text, used under page titles. IBM Plex Sans.</p>
          <p className="text-base">Body text at 15px with a 24px line height for long reading.</p>
          <p className="font-mono text-sm">Mono · 62 / 100 · 2026-10-06T14:20Z · IBM Plex Mono</p>
          <p className="eyebrow">Eyebrow label</p>
        </div>
      </Block>

      <Block id="actions" title="Actions and inputs">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete account</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm" variant="secondary">
            <RefreshCw aria-hidden /> Small
          </Button>
          <Button size="lg">
            <ScanLine aria-hidden /> Large
          </Button>
        </div>
        <div className="mt-6 grid max-w-xl gap-4 sm:grid-cols-2">
          <Field label="Email address" hint="We'll send a verification link.">
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="email"
                autoComplete="email"
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
          <Field label="Display name" error="Use 64 characters or fewer.">
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                defaultValue="A very long name"
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Tag>Password (scrambled)</Tag>
          <Tag>Phone number</Tag>
          <DemoDataLabel />
        </div>
      </Block>

      <Block id="severity" title="Severity and risk">
        <div className="flex flex-wrap gap-2">
          {EXPOSURE_SEVERITIES.map((severity) => (
            <SeverityBadge key={severity} severity={severity} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {RISK_BANDS.map((band) => (
            <RiskBadge key={band} band={band} />
          ))}
        </div>
      </Block>

      <Block id="dashboard" title="Dashboard readouts" demo>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel>
            <PanelHeader title="Security status" eyebrow="Scored" as="h3" />
            <PanelBody>
              <SecurityScore score={62} previousScore={71} />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Security status" eyebrow="Never scanned" as="h3" />
            <PanelBody>
              <SecurityScore score={null} />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Active exposures" as="h3" />
            <PanelBody>
              <SeverityBreakdown counts={{ critical: 1, high: 1, medium: 1 }} />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Monitoring" as="h3" />
            <PanelBody className="space-y-6">
              <MonitoringStatus state="off" lastScanAt="2026-10-06T14:20:00.000Z" nextScanAt={null} />
              <MonitoringStatus
                state="active"
                lastScanAt="2026-10-06T14:20:00.000Z"
                nextScanAt="2026-10-06T20:20:00.000Z"
              />
            </PanelBody>
          </Panel>
        </div>
      </Block>

      <Block id="scan" title="Scan progress" demo>
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel>
            <PanelHeader title="Running" as="h3" />
            <PanelBody>
              <ScanProgress
                state="normalizing"
                providers={[
                  { name: "Mock breach source", state: "ok" },
                  { name: "Mock paste source", state: "pending" },
                ]}
              />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Partial" as="h3" />
            <PanelBody>
              <ScanProgress
                state="partial"
                providers={[
                  { name: "Mock breach source", state: "ok" },
                  { name: "Mock paste source", state: "ok" },
                  { name: "Mock stealer-log source", state: "error" },
                ]}
                retry={
                  <Button size="sm" variant="secondary">
                    <RefreshCw aria-hidden /> Retry failed source
                  </Button>
                }
              />
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Failed" as="h3" />
            <PanelBody>
              <ScanProgress
                state="failed"
                providers={[{ name: "Mock breach source", state: "error" }]}
                retry={
                  <Button size="sm" variant="secondary">
                    <RefreshCw aria-hidden /> Try again
                  </Button>
                }
              />
            </PanelBody>
          </Panel>
        </div>
      </Block>

      <Block id="exposures" title="Exposures" demo>
        <ExposureList
          label="Example exposures"
          exposures={EXAMPLE_EXPOSURES}
          hrefFor={exposureHref}
          empty={null}
        />
        <h3 className="mt-10 mb-4 text-base font-semibold">Timeline</h3>
        <ExposureTimeline exposures={EXAMPLE_EXPOSURES} hrefFor={exposureHref} empty={null} />
      </Block>

      <Block id="identity" title="Identities and recommendations" demo>
        <div className="grid gap-4 lg:grid-cols-2">
          <IdentityCard
            identity={{
              id: "id-1",
              type: "email",
              masked: "a****x@example.com",
              verification: "verified",
              monitoring: "off",
              lastScanAt: "2026-10-06T14:20:00.000Z",
              activeExposures: 3,
            }}
            action={
              <Button size="sm">
                <ScanLine aria-hidden /> Scan now
              </Button>
            }
          />
          <IdentityCard
            identity={{
              id: "id-2",
              type: "email",
              masked: "w****k@example.org",
              verification: "pending",
              monitoring: "off",
              lastScanAt: null,
              activeExposures: 0,
            }}
            action={
              <Button size="sm" variant="secondary">
                Resend verification email
              </Button>
            }
          />
        </div>
        <div className="mt-4 space-y-2">
          <RecommendationCard
            priority="critical"
            title="Change your Northwind Rewards password"
            reason="Your password was exposed in readable form. Anyone with the leaked data can sign in as you."
            action={{ label: "Open checklist", href: "/design-system#remediation" }}
          />
          <RecommendationCard
            priority="high"
            title="Turn on two-factor authentication"
            reason="A scrambled password from Contoso Forums can sometimes be cracked. 2FA blocks sign-ins that only have the password."
            action={{ label: "How to", href: "/design-system#remediation" }}
          />
        </div>
      </Block>

      <Block id="remediation" title="Remediation checklist" demo>
        <div className="grid gap-8 lg:grid-cols-2">
          <ChecklistDemo />
          <div className="space-y-2">
            <p className="text-sm text-fg-muted">Save failure (toggle to see the error and rollback):</p>
            <ChecklistDemo failing />
          </div>
        </div>
      </Block>

      <Block id="activity" title="Recent activity" demo>
        <Panel>
          <ol className="divide-y divide-line px-5">
            <li>
              <SecurityEvent
                kind="exposure_detected"
                at="2026-09-29T08:12:00.000Z"
                detail="New critical exposure for a****x@example.com"
              />
            </li>
            <li>
              <SecurityEvent
                kind="scan_partial"
                at="2026-09-29T08:11:00.000Z"
                detail="2 of 3 sources responded"
              />
            </li>
            <li>
              <SecurityEvent
                kind="identity_verified"
                at="2026-09-29T08:02:00.000Z"
                detail="a****x@example.com"
              />
            </li>
          </ol>
        </Panel>
      </Block>

      <Block id="states" title="States">
        <div className="grid gap-4 lg:grid-cols-2">
          <EmptyState
            title="No known exposures detected"
            description="Not found in the 3 sources checked on 6 Oct 2026. That isn't a guarantee: sources only know about breaches that were reported to them. Monitoring is off."
            action={<Button variant="secondary">Scan again</Button>}
          />
          <EmptyState
            icon={ScanLine}
            title="You haven't scanned yet"
            description="Run your first scan to see which known breaches include your verified email address."
            action={
              <Button>
                <ScanLine aria-hidden /> Run first scan
              </Button>
            }
          />
          <ErrorState
            title="Couldn't load your exposures"
            description="Our database didn't respond. Nothing was lost. Try again in a moment."
            action={<Button variant="secondary">Retry</Button>}
            meta="Reference: 7f3a9c"
          />
          <LoadingState label="Loading exposures" rows={2} />
          <AccessState kind="unauthorized" action={<ButtonLink href="/auth/sign-in">Sign in</ButtonLink>} />
          <AccessState
            kind="forbidden"
            action={
              <ButtonLink href="/app/dashboard" variant="secondary">
                Back to dashboard
              </ButtonLink>
            }
          />
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <Callout tone="info" title="Results reflect 3 sources checked on 6 Oct 2026." />
          <Callout tone="ok" title="Everything is remediated">
            All known exposures are marked as handled. We&apos;ll keep reporting what the sources know.
          </Callout>
          <Callout tone="warn" title="A source is temporarily unavailable">
            Results from it may be out of date.
          </Callout>
          <Callout tone="danger" title="The scan couldn't be completed" />
        </div>
      </Block>
    </main>
  );
}

function Block({
  id,
  title,
  demo = false,
  children,
}: {
  id: string;
  title: string;
  demo?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-8 space-y-6">
      <div className="flex items-center gap-3 border-b border-line pb-3">
        <h2 id={`${id}-title`} className="text-xl font-semibold">
          {title}
        </h2>
        {demo ? <DemoDataLabel /> : null}
      </div>
      {children}
    </section>
  );
}

function Swatch({ className, name }: { className: string; name: string }) {
  return (
    <div className="overflow-hidden rounded-md border border-line">
      <div className={`h-12 ${className}`} />
      <p className="bg-surface-1 px-2 py-1.5 font-mono text-2xs text-fg-muted">{name}</p>
    </div>
  );
}
