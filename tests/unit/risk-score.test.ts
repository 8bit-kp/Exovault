import { describe, expect, it } from "vitest";
import {
  EXPOSED_DATA_TYPES,
  EXPOSURE_SEVERITIES,
  REMEDIATION_STATES,
  type ExposedDataType,
} from "@/lib/domain/exposure";
import {
  calculateRiskScore,
  recencyMultiplier,
  RISK_METHODOLOGY_VERSION,
  type RiskExposureInput,
} from "@/server/services/risk/risk-score";

const now = new Date("2026-10-07T00:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

const exposure = (overrides: Partial<RiskExposureInput> = {}): RiskExposureInput => ({
  severity: "critical",
  dataTypes: ["email", "password_hash"],
  sourceType: "breach",
  breachDate: daysAgo(30),
  firstSeenAt: daysAgo(10),
  detectionState: "new",
  remediationState: "open",
  ...overrides,
});

const score = (exposures: RiskExposureInput[], mfaEnabled?: boolean | null) =>
  calculateRiskScore({ exposures, now, mfaEnabled }).score;

/* Seeded PRNG so the property tests are reproducible. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}
const pick = <T>(random: () => number, items: readonly T[]) => items[Math.floor(random() * items.length)];
function randomExposure(random: () => number): RiskExposureInput {
  const types = EXPOSED_DATA_TYPES.filter(() => random() < 0.25) as ExposedDataType[];
  return exposure({
    severity: pick(random, EXPOSURE_SEVERITIES),
    dataTypes: types,
    sourceType: random() < 0.1 ? "stealer_log" : "breach",
    breachDate: random() < 0.2 ? null : daysAgo(Math.floor(random() * 4000)),
    firstSeenAt: daysAgo(Math.floor(random() * 400)),
    detectionState: random() < 0.15 ? "no_longer_reported" : "existing",
    remediationState: pick(random, REMEDIATION_STATES),
  });
}

describe("calculateRiskScore: boundaries", () => {
  it("is 0 / Minimal with an explanatory factor for no exposures", () => {
    const result = calculateRiskScore({ exposures: [], now });
    expect(result).toMatchObject({ score: 0, band: "minimal", methodologyVersion: RISK_METHODOLOGY_VERSION });
    expect(result.factors.map((f) => f.key)).toEqual(["no_exposures"]);
  });

  it("never exceeds 100, however many critical exposures", () => {
    const many = Array.from({ length: 200 }, () => exposure({ dataTypes: ["password_plaintext", "phone"] }));
    expect(score(many)).toBeLessThanOrEqual(100);
    expect(score(many)).toBeGreaterThanOrEqual(95);
  });

  it("stays within 0–100 and in the matching band for random inputs", () => {
    const random = rng(42);
    for (let i = 0; i < 300; i++) {
      const exposures = Array.from({ length: Math.floor(random() * 12) }, () => randomExposure(random));
      const result = calculateRiskScore({ exposures, now });
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(Number.isInteger(result.score)).toBe(true);
    }
  });
});

describe("calculateRiskScore: worked examples (docs/RISK-SCORE.md)", () => {
  it.each([
    [
      "one recent open low (email only)",
      [exposure({ severity: "low", dataTypes: ["email"] })],
      11,
      "minimal",
    ],
    [
      "one recent open medium (phone)",
      [exposure({ severity: "medium", dataTypes: ["email", "phone"] })],
      28,
      "low",
    ],
    ["one recent open high (password hash)", [exposure({ severity: "high" })], 43, "moderate"],
    [
      "one recent open critical (readable password)",
      [exposure({ dataTypes: ["email", "password_plaintext"] })],
      72,
      "high",
    ],
    [
      "two recent open criticals",
      [
        exposure({ dataTypes: ["email", "password_plaintext"] }),
        exposure({ dataTypes: ["email", "password_plaintext"] }),
      ],
      87,
      "critical",
    ],
    [
      "one critical from 2014, remediated",
      [exposure({ breachDate: new Date("2014-01-01"), remediationState: "remediated" })],
      11,
      "minimal",
    ],
  ] as const)("$0", (_name, exposures, expected, band) => {
    const result = calculateRiskScore({ exposures: [...exposures], now });
    expect(result.score).toBe(expected);
    expect(result.band).toBe(band);
  });
});

describe("calculateRiskScore: properties", () => {
  it("is monotonic: adding an open exposure never lowers the score", () => {
    const random = rng(7);
    for (let i = 0; i < 500; i++) {
      const base = Array.from({ length: Math.floor(random() * 10) }, () => randomExposure(random));
      const added = {
        ...randomExposure(random),
        remediationState: "open" as const,
        detectionState: "new" as const,
      };
      expect(score([...base, added])).toBeGreaterThanOrEqual(score(base));
    }
  });

  it("is order-independent and deterministic", () => {
    const random = rng(99);
    const items = Array.from({ length: 8 }, () => randomExposure(random));
    expect(calculateRiskScore({ exposures: items, now })).toEqual(
      calculateRiskScore({ exposures: [...items].reverse(), now }),
    );
  });

  it("has diminishing returns: each extra identical exposure adds less", () => {
    const deltas = [1, 2, 3, 4, 5].map(
      (n) =>
        score(Array.from({ length: n + 1 }, () => exposure({ severity: "medium", dataTypes: ["email"] }))) -
        score(Array.from({ length: n }, () => exposure({ severity: "medium", dataTypes: ["email"] }))),
    );
    for (let i = 1; i < deltas.length; i++) expect(deltas[i]).toBeLessThanOrEqual(deltas[i - 1]);
  });
});

describe("calculateRiskScore: remediation, recency, detection", () => {
  it("remediation lowers the score but never to zero (residual risk)", () => {
    const open = score([exposure()]);
    const inProgress = score([exposure({ remediationState: "in_progress" })]);
    const remediated = score([exposure({ remediationState: "remediated" })]);
    expect(inProgress).toBeLessThan(open);
    expect(remediated).toBeLessThan(inProgress);
    expect(remediated).toBeGreaterThan(0);
  });

  it("dismissing counts for more than fixing (nothing was changed)", () => {
    expect(score([exposure({ remediationState: "dismissed" })])).toBeGreaterThan(
      score([exposure({ remediationState: "remediated" })]),
    );
  });

  it("reports the remediation credit as a negative factor", () => {
    const result = calculateRiskScore({ exposures: [exposure({ remediationState: "remediated" })], now });
    const credit = result.factors.find((f) => f.key === "remediation_credit");
    expect(credit?.points).toBeLessThan(0);
  });

  it("decays with age: ≤1y, ≤3y, ≤7y, older", () => {
    expect(recencyMultiplier(daysAgo(100), now)).toBe(1);
    expect(recencyMultiplier(daysAgo(800), now)).toBe(0.8);
    expect(recencyMultiplier(daysAgo(2000), now)).toBe(0.6);
    expect(recencyMultiplier(daysAgo(4000), now)).toBe(0.4);
    expect(score([exposure({ breachDate: daysAgo(4000) })])).toBeLessThan(
      score([exposure({ breachDate: daysAgo(30) })]),
    );
  });

  it("uses first-seen date for recency when the incident date is unknown", () => {
    expect(score([exposure({ breachDate: null, firstSeenAt: daysAgo(5) })])).toBe(
      score([exposure({ breachDate: daysAgo(5) })]),
    );
  });

  it("weighs no-longer-reported exposures less", () => {
    expect(score([exposure({ detectionState: "no_longer_reported" })])).toBeLessThan(score([exposure()]));
  });
});

describe("calculateRiskScore: compounding factors and explanation", () => {
  it("adds usable-credential, repeated-password and phone factors", () => {
    const result = calculateRiskScore({
      exposures: [
        exposure({ dataTypes: ["password_plaintext", "phone"] }),
        exposure({ severity: "high", dataTypes: ["password_hash"] }),
        exposure({ severity: "high", dataTypes: ["password_hash"] }),
      ],
      now,
    });
    const keys = result.factors.map((f) => f.key);
    expect(keys).toEqual(
      expect.arrayContaining(["active_credentials", "repeated_password_exposure", "phone_exposure"]),
    );
  });

  it("drops compounding bonuses once the exposures are remediated", () => {
    const result = calculateRiskScore({
      exposures: [exposure({ dataTypes: ["password_plaintext"], remediationState: "remediated" })],
      now,
    });
    expect(result.factors.map((f) => f.key)).not.toContain("active_credentials");
  });

  it("explains itself: positive factors sum to the score (±1 per factor for rounding)", () => {
    const random = rng(1234);
    for (let i = 0; i < 100; i++) {
      const exposures = Array.from({ length: 1 + Math.floor(random() * 8) }, () => randomExposure(random));
      const result = calculateRiskScore({ exposures, now });
      const positive = result.factors.filter((f) => f.points > 0);
      const sum = positive.reduce((acc, f) => acc + f.points, 0);
      expect(Math.abs(sum - result.score)).toBeLessThanOrEqual(positive.length);
    }
  });

  it("counts MFA only when the user reported it on; unknown changes nothing", () => {
    const exposures = [exposure({ dataTypes: ["password_plaintext"] })];
    expect(score(exposures, true)).toBeLessThan(score(exposures, null));
    expect(score(exposures, null)).toBe(score(exposures, undefined));
    expect(calculateRiskScore({ exposures, now }).factors.map((f) => f.key)).toContain("mfa_unknown");
  });
});
