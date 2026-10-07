import { describe, expect, it } from "vitest";
import { SCAN_STATES, TERMINAL_SCAN_STATES } from "@/lib/domain/exposure";
import { canTransition, isTerminalScanState } from "@/lib/domain/scan";

describe("scan state machine (spec Part 8)", () => {
  it("allows the happy path one step at a time", () => {
    const path = ["queued", "running", "normalizing", "matching", "scoring", "completed"] as const;
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true);
  });

  it("lets scoring end in completed, partial or failed", () => {
    for (const end of ["completed", "partial", "failed"] as const)
      expect(canTransition("scoring", end)).toBe(true);
  });

  it("allows failing from every non-terminal state", () => {
    for (const state of SCAN_STATES.filter((s) => !isTerminalScanState(s))) {
      expect(canTransition(state, "failed")).toBe(true);
    }
  });

  it("never skips steps or goes backwards", () => {
    expect(canTransition("queued", "matching")).toBe(false);
    expect(canTransition("running", "completed")).toBe(false);
    expect(canTransition("matching", "running")).toBe(false);
    expect(canTransition("queued", "partial")).toBe(false);
  });

  it("treats terminal states as final", () => {
    for (const terminal of TERMINAL_SCAN_STATES) {
      expect(isTerminalScanState(terminal)).toBe(true);
      for (const next of SCAN_STATES) expect(canTransition(terminal, next)).toBe(false);
    }
  });
});
