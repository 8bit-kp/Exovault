/**
 * Exposure Risk Score vocabulary (spec Part 9). The scorer itself arrives with
 * the exposure engine; the bands live here so the UI and the scorer share one
 * definition. Direction is fixed: 0 = lowest known risk, 100 = highest.
 */

export const RISK_SCORE_MIN = 0;
export const RISK_SCORE_MAX = 100;

export const RISK_BANDS = ["minimal", "low", "moderate", "high", "critical"] as const;
export type RiskBand = (typeof RISK_BANDS)[number];

/** Inclusive lower bound of each band. */
const BAND_FLOORS: ReadonlyArray<readonly [RiskBand, number]> = [
  ["critical", 80],
  ["high", 60],
  ["moderate", 40],
  ["low", 20],
  ["minimal", 0],
];

/** Clamp to 0–100 and round to an integer, so every caller displays the same number. */
export function normalizeRiskScore(score: number): number {
  if (!Number.isFinite(score)) {
    throw new RangeError("Risk score must be a finite number");
  }
  return Math.min(RISK_SCORE_MAX, Math.max(RISK_SCORE_MIN, Math.round(score)));
}

export function riskBandForScore(score: number): RiskBand {
  const value = normalizeRiskScore(score);
  for (const [band, floor] of BAND_FLOORS) {
    if (value >= floor) return band;
  }
  return "minimal";
}
