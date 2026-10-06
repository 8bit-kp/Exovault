import { describe, expect, it } from "vitest";
import { SCAN_STATES } from "@/lib/domain/exposure";
import { SCAN_STEPS, scanAnnouncement, scanStepStatuses } from "@/components/monitoring/scan-steps";

const statuses = (...args: Parameters<typeof scanStepStatuses>) =>
  scanStepStatuses(...args).map((s) => s.status);

describe("scanStepStatuses", () => {
  it("has exactly one visible step per non-terminal persisted state", () => {
    const nonTerminal = SCAN_STATES.filter((s) => !["completed", "partial", "failed"].includes(s));
    expect(SCAN_STEPS.map((s) => s.state)).toEqual(nonTerminal);
  });

  it("marks earlier steps done and later steps pending", () => {
    expect(statuses("queued")).toEqual(["current", "pending", "pending", "pending", "pending"]);
    expect(statuses("matching")).toEqual(["done", "done", "done", "current", "pending"]);
  });

  it("shows every step done for completed and partial scans", () => {
    expect(statuses("completed").every((s) => s === "done")).toBe(true);
    expect(statuses("partial").every((s) => s === "done")).toBe(true);
  });

  it("marks the step where a scan failed, defaulting to the provider step", () => {
    expect(statuses("failed")).toEqual(["done", "failed", "pending", "pending", "pending"]);
    expect(statuses("failed", "scoring")).toEqual(["done", "done", "done", "done", "failed"]);
  });

  it("never shows more than one current step", () => {
    for (const state of SCAN_STATES) {
      expect(statuses(state).filter((s) => s === "current").length).toBeLessThanOrEqual(1);
    }
  });
});

describe("scanAnnouncement", () => {
  it("states partial coverage honestly", () => {
    expect(scanAnnouncement("partial", { responded: 2, total: 3 })).toMatch(/2 of 3 sources.*incomplete/);
  });

  it("names the current step while running", () => {
    expect(scanAnnouncement("running", { responded: 0, total: 2 })).toBe("Checking sources…");
  });
});
