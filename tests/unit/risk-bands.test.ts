import { describe, expect, it } from "vitest";
import { normalizeRiskScore, riskBandForScore } from "@/lib/domain/risk";

describe("riskBandForScore", () => {
  it.each([
    [0, "minimal"],
    [19, "minimal"],
    [20, "low"],
    [39, "low"],
    [40, "moderate"],
    [59, "moderate"],
    [60, "high"],
    [79, "high"],
    [80, "critical"],
    [100, "critical"],
  ] as const)("maps %i to %s (band edges from spec Part 9)", (score, band) => {
    expect(riskBandForScore(score)).toBe(band);
  });

  it("is monotonic: a higher score never lands in a lower band", () => {
    const order = ["minimal", "low", "moderate", "high", "critical"];
    let previous = 0;
    for (let score = 0; score <= 100; score++) {
      const rank = order.indexOf(riskBandForScore(score));
      expect(rank).toBeGreaterThanOrEqual(previous);
      previous = rank;
    }
  });
});

describe("normalizeRiskScore", () => {
  it("clamps to 0–100 and rounds, so every surface shows the same number", () => {
    expect(normalizeRiskScore(-5)).toBe(0);
    expect(normalizeRiskScore(140)).toBe(100);
    expect(normalizeRiskScore(59.5)).toBe(60);
    expect(riskBandForScore(59.5)).toBe("high");
  });

  it("refuses NaN and infinity rather than displaying a misleading score", () => {
    expect(() => normalizeRiskScore(Number.NaN)).toThrow(RangeError);
    expect(() => normalizeRiskScore(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
