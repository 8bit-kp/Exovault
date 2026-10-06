import { Check, CircleDashed, LoaderCircle, X } from "lucide-react";
import type { ReactNode } from "react";
import { TERMINAL_SCAN_STATES, type ScanState } from "@/lib/domain/exposure";
import type { ProviderResultState } from "@/lib/domain/monitoring";
import { cn } from "@/lib/utils/cn";
import { Callout } from "@/components/ui/callout";
import { scanAnnouncement, scanStepStatuses, type StepStatus } from "./scan-steps";

export interface ProviderProgress {
  /** Display name of the source, e.g. "Have I Been Pwned". */
  name: string;
  /** "pending" until the provider call settles. */
  state: ProviderResultState | "pending";
}

interface ScanProgressProps {
  state: ScanState;
  failedStep?: ScanState;
  providers: ProviderProgress[];
  /** Retry control for failed/partial scans (wired to the scan service in Phase 6). */
  retry?: ReactNode;
  className?: string;
}

const STEP_ICON: Record<StepStatus, ReactNode> = {
  done: <Check aria-hidden className="size-3.5 text-ok" strokeWidth={3} />,
  current: (
    <LoaderCircle aria-hidden className="size-3.5 animate-spin text-accent motion-reduce:animate-none" />
  ),
  pending: <CircleDashed aria-hidden className="size-3.5 text-fg-subtle" />,
  failed: <X aria-hidden className="size-3.5 text-danger" strokeWidth={3} />,
};

const STEP_STATUS_TEXT: Record<StepStatus, string> = {
  done: "done",
  current: "in progress",
  pending: "not started",
  failed: "failed",
};

export function ScanProgress({ state, failedStep, providers, retry, className }: ScanProgressProps) {
  const steps = scanStepStatuses(state, failedStep);
  const settled = providers.filter((p) => p.state !== "pending" && p.state !== "skipped");
  const responded = providers.filter((p) => p.state === "ok").length;
  const total = providers.filter((p) => p.state !== "skipped").length;
  const terminal = TERMINAL_SCAN_STATES.includes(state);

  return (
    <div className={cn("space-y-5", className)}>
      {/* The only live region: one sentence per persisted state change. */}
      <p role="status" aria-live="polite" className="sr-only">
        {scanAnnouncement(state, { responded, total })}
      </p>

      <ol className="space-y-1" aria-label="Scan steps">
        {steps.map((step) => (
          <li
            key={step.label}
            className={cn(
              "flex items-center gap-3 rounded-sm px-2 py-1.5 font-mono text-sm",
              step.status === "current" && "bg-accent-tint text-fg",
              step.status === "done" && "text-fg-muted",
              step.status === "pending" && "text-fg-subtle",
              step.status === "failed" && "bg-danger/10 text-fg",
            )}
            aria-current={step.status === "current" ? "step" : undefined}
          >
            <span className="grid size-4 place-items-center">{STEP_ICON[step.status]}</span>
            <span>{step.label}</span>
            <span className="sr-only">: {STEP_STATUS_TEXT[step.status]}</span>
          </li>
        ))}
      </ol>

      <div>
        <p className="eyebrow mb-2">
          Sources · {settled.length} of {total} settled
        </p>
        <ul className="divide-y divide-line rounded-md border border-line">
          {providers.map((provider) => (
            <li key={provider.name} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="text-fg">{provider.name}</span>
              <ProviderStateLabel state={provider.state} />
            </li>
          ))}
        </ul>
      </div>

      {state === "partial" ? (
        <Callout
          tone="warn"
          title={`${responded} of ${total} sources responded. Results may be incomplete.`}
          action={retry}
        >
          Exposures from the sources that responded are shown. Sources that failed weren&apos;t checked, so
          they can&apos;t confirm or rule anything out.
        </Callout>
      ) : null}
      {state === "failed" ? (
        <Callout tone="danger" title="The scan couldn't be completed." action={retry}>
          No source returned a usable result, so nothing was checked. Your existing results are unchanged.
        </Callout>
      ) : null}
      {!terminal ? (
        <p className="text-xs text-fg-subtle">
          You can leave this page. The scan keeps running and results are saved.
        </p>
      ) : null}
    </div>
  );
}

function ProviderStateLabel({ state }: { state: ProviderProgress["state"] }) {
  const map = {
    pending: { text: "Waiting", className: "text-fg-subtle" },
    ok: { text: "Responded", className: "text-ok" },
    error: { text: "Unavailable", className: "text-danger" },
    skipped: { text: "Skipped", className: "text-fg-subtle" },
  } as const;
  const { text, className } = map[state];
  return <span className={cn("font-mono text-xs", className)}>{text}</span>;
}
