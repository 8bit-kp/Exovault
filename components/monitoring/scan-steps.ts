import type { ScanState } from "@/lib/domain/exposure";

/**
 * Maps a persisted scan state 1:1 onto the visible steps (spec Part 8). The UI
 * never advances a step on a timer; it only reflects what the server stored.
 */
export const SCAN_STEPS = [
  { state: "queued", label: "Preparing secure query" },
  { state: "running", label: "Checking sources" },
  { state: "normalizing", label: "Normalizing results" },
  { state: "matching", label: "Matching to your identity" },
  { state: "scoring", label: "Scoring risk" },
] as const satisfies ReadonlyArray<{ state: ScanState; label: string }>;

export type StepStatus = "done" | "current" | "pending" | "failed";

export interface StepView {
  label: string;
  status: StepStatus;
}

/**
 * `failedStep` is the last non-terminal state the scan reached before failing,
 * when known. Without it, a failure is attributed to "Checking sources", which
 * is where provider failures happen.
 */
export function scanStepStatuses(state: ScanState, failedStep?: ScanState): StepView[] {
  if (state === "completed" || state === "partial") {
    return SCAN_STEPS.map(({ label }) => ({ label, status: "done" }));
  }
  const activeIndex =
    state === "failed"
      ? Math.max(
          0,
          SCAN_STEPS.findIndex((step) => step.state === (failedStep ?? "running")),
        )
      : SCAN_STEPS.findIndex((step) => step.state === state);
  return SCAN_STEPS.map(({ label }, index) => ({
    label,
    status:
      index < activeIndex
        ? "done"
        : index === activeIndex
          ? state === "failed"
            ? "failed"
            : "current"
          : "pending",
  }));
}

/** One sentence for the live region. Changes only when the persisted state changes. */
export function scanAnnouncement(state: ScanState, sources: { responded: number; total: number }): string {
  switch (state) {
    case "completed":
      return `Scan complete. ${sources.responded} of ${sources.total} sources responded.`;
    case "partial":
      return `Scan finished with gaps. ${sources.responded} of ${sources.total} sources responded; results may be incomplete.`;
    case "failed":
      return "Scan failed. No sources could be checked.";
    default: {
      const step = SCAN_STEPS.find((s) => s.state === state);
      return `${step?.label ?? "Working"}…`;
    }
  }
}
