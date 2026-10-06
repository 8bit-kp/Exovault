import { Check } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils/cn";

const STEPS = [
  { key: "account", label: "Account" },
  { key: "identity", label: "Verify address" },
  { key: "scan", label: "First scan" },
  { key: "results", label: "Results" },
] as const;

export type OnboardingStep = (typeof STEPS)[number]["key"];

/** First-run flow (spec 13.2). One question per screen, progress always visible. */
export function OnboardingShell({
  step,
  title,
  description,
  children,
}: {
  step: OnboardingStep;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  const current = STEPS.findIndex((s) => s.key === step);
  return (
    <div className="bg-instrument-grid flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/app/dashboard" className="rounded-sm">
          <Logo />
        </Link>
        <Link href="/app/dashboard" className="text-sm text-fg-muted hover:text-fg">
          Skip to dashboard
        </Link>
      </header>
      <main id="main" className="flex flex-1 justify-center px-4 pt-4 pb-16">
        <div className="w-full max-w-lg space-y-6">
          <ol className="grid grid-cols-4 gap-2" aria-label="Setup progress">
            {STEPS.map((s, index) => {
              const done = index < current;
              const active = index === current;
              return (
                <li key={s.key} aria-current={active ? "step" : undefined} className="space-y-1.5">
                  <span
                    aria-hidden
                    className={cn("block h-1 rounded-full", done || active ? "bg-accent" : "bg-line-strong")}
                  />
                  <span
                    className={cn("flex items-center gap-1 text-xs", active ? "text-fg" : "text-fg-subtle")}
                  >
                    {done ? <Check aria-hidden className="size-3 text-ok" /> : null}
                    {s.label}
                    <span className="sr-only">{done ? " (done)" : active ? " (current)" : ""}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          <div className="rounded-lg border border-line bg-surface-1 p-6 shadow-overlay sm:p-8">
            <h1 className="text-2xl font-semibold text-fg">{title}</h1>
            {description ? <div className="mt-2 text-sm text-fg-muted">{description}</div> : null}
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
