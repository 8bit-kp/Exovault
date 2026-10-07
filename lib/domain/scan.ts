import { TERMINAL_SCAN_STATES, type ScanState } from "./exposure";

/**
 * Scan lifecycle (spec Part 8). Every transition is persisted with a
 * compare-and-set on the current state, so a state can only advance once and
 * only along these edges. Each state maps to real work in the processor;
 * nothing advances on a timer.
 */
export const SCAN_TRIGGERS = ["manual", "retry", "scheduled"] as const;
export type ScanTrigger = (typeof SCAN_TRIGGERS)[number];

const EDGES: Record<ScanState, readonly ScanState[]> = {
  queued: ["running", "failed"],
  running: ["normalizing", "failed"],
  normalizing: ["matching", "failed"],
  matching: ["scoring", "failed"],
  scoring: ["completed", "partial", "failed"],
  completed: [],
  partial: [],
  failed: [],
};

export function canTransition(from: ScanState, to: ScanState): boolean {
  return EDGES[from].includes(to);
}

export function isTerminalScanState(state: ScanState): boolean {
  return TERMINAL_SCAN_STATES.includes(state);
}

/** Manual scans per identity (spec 12.3 / Part 8). */
export const MANUAL_SCAN_COOLDOWN_MS = 15 * 60_000;

/** A non-terminal scan that hasn't progressed for this long is treated as interrupted (process restart). */
export const SCAN_STALE_AFTER_MS = 2 * 60_000;

/** Safe, user-facing failure reasons for a whole scan. */
export const SCAN_FAILURE_REASONS = ["all_sources_failed", "interrupted", "internal"] as const;
export type ScanFailureReason = (typeof SCAN_FAILURE_REASONS)[number];
