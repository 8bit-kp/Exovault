import {
  ArrowRight,
  BellRing,
  Check,
  EyeOff,
  Fingerprint,
  KeyRound,
  ListChecks,
  Lock,
  MailCheck,
  Radar,
  ScanLine,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { brand } from "@/config/brand";
import { AUTH_ROUTES } from "@/config/navigation";
import { SecurityScore } from "@/components/dashboard/security-score";
import { SeverityBreakdown } from "@/components/dashboard/severity-breakdown";
import { ExposureCard } from "@/components/exposure/exposure-card";
import { ButtonLink } from "@/components/ui/button";
import { DemoDataLabel } from "@/components/ui/demo-data-label";
import { Panel } from "@/components/ui/panel";
import { EXAMPLE_EXPOSURES } from "@/lib/demo/examples";
import { cn } from "@/lib/utils/cn";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <WhatWeCheck />
      <ExampleResult />
      <PrivacyArchitecture />
      <Remediation />
      <Monitoring />
      <Limitations />
      <ClosingCta />
    </>
  );
}

function Section({
  id,
  index,
  eyebrow,
  title,
  intro,
  children,
  className,
}: {
  id: string;
  index: string;
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn("scroll-mt-20 border-t border-line", className)}
    >
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="grid gap-x-12 gap-y-4 lg:grid-cols-[14rem_1fr]">
          <p className="eyebrow pt-2">
            <span className="text-accent">{index}</span> / {eyebrow}
          </p>
          <div className="max-w-2xl space-y-4">
            <h2 id={`${id}-title`} className="text-3xl font-semibold text-fg sm:text-4xl">
              {title}
            </h2>
            {intro ? <div className="text-lg text-fg-muted">{intro}</div> : null}
          </div>
        </div>
        <div className="mt-12 lg:ml-[calc(14rem+3rem)]">{children}</div>
      </div>
    </section>
  );
}

function Hero() {
  return (
    <section aria-labelledby="hero-title" className="bg-instrument-grid relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 pt-16 pb-20 sm:px-6 sm:pt-24 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:pb-28">
        <div className="space-y-7">
          <p className="eyebrow">Exposure intelligence for individuals</p>
          <h1 id="hero-title" className="text-5xl font-semibold tracking-tight text-fg sm:text-6xl">
            Know what is exposed.
            <br />
            <span className="text-fg-muted">Know what to do next.</span>
          </h1>
          <p className="max-w-xl text-lg text-fg-muted">
            {brand.name} checks identifiers you own against documented breach and credential-exposure sources,
            explains what was found in plain language, and gives you a checklist to fix it. You verify
            ownership first, so no one can use it to look you up.
          </p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={AUTH_ROUTES.signUp} size="lg">
              Check your exposure
              <ArrowRight aria-hidden />
            </ButtonLink>
            <ButtonLink href="/#how-it-works" size="lg" variant="secondary">
              See how it works
            </ButtonLink>
          </div>
          <p className="text-sm text-fg-subtle">
            Free during beta. Results reflect the sources we check, not the whole internet.
          </p>
        </div>
        <StatusReadout />
      </div>
    </section>
  );
}

/** The "security-status visual" (spec 13.4): a real component rendering labelled example data. */
function StatusReadout() {
  return (
    <Panel aria-label="Example status readout" className="shadow-overlay">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <p className="font-mono text-xs text-fg-muted">a****x@example.com</p>
        <DemoDataLabel>Example</DemoDataLabel>
      </div>
      <div className="space-y-6 px-5 py-5">
        <SecurityScore score={62} previousScore={71} />
        <div className="border-t border-line pt-5">
          <SeverityBreakdown counts={{ critical: 1, high: 1, medium: 1 }} />
        </div>
      </div>
    </Panel>
  );
}

const STEPS: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: MailCheck,
    title: "Verify you own it",
    body: "Add an email address and confirm it from your inbox. We never look up an identifier you haven't proven is yours.",
  },
  {
    icon: ScanLine,
    title: "Scan documented sources",
    body: "We query breach-intelligence providers through their official APIs. You see each step and which sources answered.",
  },
  {
    icon: ListChecks,
    title: "Understand and act",
    body: "Each finding shows what was exposed, how serious it is, and a checklist of what to do. Progress lowers your risk score.",
  },
];

function HowItWorks() {
  return (
    <Section
      id="how-it-works"
      index="01"
      eyebrow="How it works"
      title="Three steps, and you can see each one."
      intro="No mystery progress bars. Every scan step on screen maps to a step the server actually completed."
    >
      <ol className="grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3">
        {STEPS.map((step, index) => (
          <li key={step.title} className="space-y-3 bg-surface-1 p-6">
            <div className="flex items-center justify-between">
              <step.icon aria-hidden className="size-5 text-accent" />
              <span className="font-mono text-xs text-fg-subtle">0{index + 1}</span>
            </div>
            <h3 className="text-lg font-semibold text-fg">{step.title}</h3>
            <p className="text-sm text-fg-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function WhatWeCheck() {
  return (
    <Section
      id="coverage"
      index="02"
      eyebrow="Coverage"
      title="What can be monitored today, and what can't."
      intro="We would rather tell you exactly what we check than imply we check everything."
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Panel className="p-6">
          <h3 className="flex items-center gap-2 text-base font-semibold text-fg">
            <Check aria-hidden className="size-4 text-ok" /> Available now
          </h3>
          <ul className="mt-4 space-y-3 text-sm text-fg-muted">
            <li>One verified email address per account</li>
            <li>Known data breaches reported by our configured providers</li>
            <li>Which kinds of data were involved (passwords, phone numbers, addresses, …)</li>
            <li>On-demand scans with per-source results</li>
          </ul>
        </Panel>
        <Panel className="p-6">
          <h3 className="flex items-center gap-2 text-base font-semibold text-fg">
            <X aria-hidden className="size-4 text-fg-subtle" /> Not available
          </h3>
          <ul className="mt-4 space-y-3 text-sm text-fg-muted">
            <li>Phone numbers, usernames and domains (planned)</li>
            <li>Dark-web crawling or scraping leak forums. We don&apos;t do this, by design</li>
            <li>Breaches our providers don&apos;t know about</li>
            <li>Looking up anyone else&apos;s email address</li>
          </ul>
        </Panel>
      </div>
    </Section>
  );
}

function ExampleResult() {
  return (
    <Section
      id="example"
      index="03"
      eyebrow="Example result"
      title="Severity first, then the detail."
      intro="Findings are ordered by what needs attention. Severity is always spelled out, shown with an icon and a signal-bar shape, never by colour alone."
    >
      <div className="mb-4 flex items-center gap-3">
        <DemoDataLabel>Example</DemoDataLabel>
        <p className="text-sm text-fg-subtle">Fictional sources. Not a real scan result.</p>
      </div>
      <ul aria-label="Example exposures" className="space-y-2">
        {EXAMPLE_EXPOSURES.slice(0, 3).map((exposure) => (
          <li key={exposure.id}>
            <ExposureCard exposure={exposure} href={AUTH_ROUTES.signUp} />
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-start gap-2 text-sm text-fg-muted">
        <EyeOff aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
        Sources flagged as sensitive (for example dating or health sites) stay hidden in lists and emails. You
        reveal them inside the app, deliberately.
      </p>
    </Section>
  );
}

const PRIVACY_POINTS: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: Lock,
    title: "Encrypted identifiers",
    body: "Your email is stored with AES-256-GCM field-level encryption under a versioned key. The database alone can't read it.",
  },
  {
    icon: Fingerprint,
    title: "Keyed lookups, not plain hashes",
    body: "Duplicate checks use an HMAC with a separate secret, so a leaked database can't be reversed with a hash dictionary.",
  },
  {
    icon: EyeOff,
    title: "Masked by default",
    body: "The app shows a**@example.com unless you choose to reveal it. Identifiers never appear in our URLs, logs or analytics.",
  },
  {
    icon: KeyRound,
    title: "No raw breach data",
    body: "We keep normalized findings, not provider responses or leaked credentials. Raw responses live in memory only.",
  },
];

function PrivacyArchitecture() {
  return (
    <Section
      id="privacy"
      index="04"
      eyebrow="Privacy architecture"
      title="Built to hold as little about you as possible."
      intro="To check an email address we have to send it to the providers we query. Everything else is designed so we keep less, for less time."
    >
      <dl className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
        {PRIVACY_POINTS.map((point) => (
          <div key={point.title} className="space-y-2 bg-surface-1 p-6">
            <dt className="flex items-center gap-2 text-base font-semibold text-fg">
              <point.icon aria-hidden className="size-4 text-accent" />
              {point.title}
            </dt>
            <dd className="text-sm text-fg-muted">{point.body}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

function Remediation() {
  return (
    <Section
      id="remediation"
      index="05"
      eyebrow="Remediation"
      title="Every finding ends in a checklist."
      intro="Change the password. Update anywhere you reused it. Turn on two-factor authentication. Review recent account activity. Tick items off as you go; your progress is saved and reflected in your risk score."
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {[
          "Change the password for this account",
          "Change it anywhere else you reused it",
          "Turn on two-factor authentication",
          "Review recent sign-ins and account activity",
        ].map((item) => (
          <li
            key={item}
            className="flex items-center gap-3 rounded-md border border-line bg-surface-1 px-4 py-3 text-sm text-fg"
          >
            <span aria-hidden className="size-4 rounded-sm border border-line-strong" />
            {item}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function Monitoring() {
  return (
    <Section
      id="monitoring"
      index="06"
      eyebrow="Continuous monitoring"
      title="Scheduled re-checks are in development."
      intro="Today, scans run when you ask. Next, scheduled monitoring will re-check your verified identities, tell you only about new or changed findings, and never alert you twice about the same thing. Until it ships, the dashboard says “Monitoring: Off”."
    >
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="inline-flex items-center gap-2 rounded-md border border-line bg-surface-1 px-3 py-2 text-fg-muted">
          <Radar aria-hidden className="size-4 text-fg-subtle" /> Scheduled scans: planned
        </span>
        <span className="inline-flex items-center gap-2 rounded-md border border-line bg-surface-1 px-3 py-2 text-fg-muted">
          <BellRing aria-hidden className="size-4 text-fg-subtle" /> Email alerts: planned
        </span>
      </div>
    </Section>
  );
}

function Limitations() {
  return (
    <Section
      id="limitations"
      index="07"
      eyebrow="Principles & limitations"
      title="What a clean result does and doesn't mean."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-6">
          <h3 className="flex items-center gap-2 text-base font-semibold text-fg">
            <ShieldCheck aria-hidden className="size-4 text-accent" /> How we work
          </h3>
          <ul className="mt-4 space-y-3 text-sm text-fg-muted">
            <li>Ownership is verified before any lookup.</li>
            <li>Only documented provider APIs, used within their terms.</li>
            <li>Every result shows which sources were checked, and when.</li>
            <li>Your data can be exported or deleted from settings.</li>
          </ul>
        </Panel>
        <Panel className="p-6">
          <h3 className="text-base font-semibold text-fg">Limitations</h3>
          <ul className="mt-4 space-y-3 text-sm text-fg-muted">
            <li>
              “No known exposures” means <em>not found in the sources we checked</em>. It doesn&apos;t mean
              you are safe.
            </li>
            <li>Providers learn about breaches late, and some breaches are never disclosed.</li>
            <li>We don&apos;t monitor the dark web and we don&apos;t detect every breach.</li>
            <li>The Exposure Risk Score is our own measure, not an industry standard.</li>
          </ul>
        </Panel>
      </div>
    </Section>
  );
}

function ClosingCta() {
  return (
    <section aria-labelledby="cta-title" className="bg-instrument-grid border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-20 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <h2 id="cta-title" className="text-3xl font-semibold text-fg">
            See what the sources know about you.
          </h2>
          <p className="text-fg-muted">Create an account, verify your email, and run your first scan.</p>
        </div>
        <ButtonLink href={AUTH_ROUTES.signUp} size="lg">
          Check your exposure
          <ArrowRight aria-hidden />
        </ButtonLink>
      </div>
    </section>
  );
}
