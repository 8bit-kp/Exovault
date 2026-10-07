import type {
  DetectionState,
  ExposedDataType,
  ExposureSeverity,
  ExposureSourceType,
  RemediationState,
} from "@/lib/domain/exposure";
import { normalizeRiskScore, riskBandForScore, type RiskBand } from "@/lib/domain/risk";

/**
 * Exposure Risk Score (spec Part 9). Pure and deterministic: no I/O, `now`
 * injected. 0 = lowest known risk, 100 = highest. Every constant below is
 * documented, with worked examples, in docs/RISK-SCORE.md. Changing any of
 * them means bumping RISK_METHODOLOGY_VERSION so stored snapshots stay
 * interpretable.
 */
export const RISK_METHODOLOGY_VERSION = "risk-2026-10.1";

export interface RiskExposureInput {
  severity: ExposureSeverity;
  dataTypes: readonly ExposedDataType[];
  sourceType: ExposureSourceType;
  /** Incident date; falls back to `firstSeenAt` for recency when unknown. */
  breachDate: Date | null;
  firstSeenAt: Date;
  detectionState: DetectionState;
  remediationState: RemediationState;
}

export interface RiskInput {
  exposures: readonly RiskExposureInput[];
  now: Date;
  /** User-reported MFA status, when known (later phase). Unknown never changes the score. */
  mfaEnabled?: boolean | null;
}

export type RiskFactorKey =
  | "severity_critical"
  | "severity_high"
  | "severity_medium"
  | "severity_low"
  | "severity_info"
  | "active_credentials"
  | "repeated_password_exposure"
  | "phone_exposure"
  | "mfa_enabled"
  | "remediation_credit"
  | "mfa_unknown"
  | "no_exposures";

export interface RiskFactor {
  key: RiskFactorKey;
  label: string;
  /** Points of the final score this factor accounts for; negative for reductions; 0 for information. */
  points: number;
  detail: string;
}

export interface RiskScoreResult {
  score: number;
  band: RiskBand;
  factors: RiskFactor[];
  methodologyVersion: string;
}

/* ---------------- constants (docs/RISK-SCORE.md) ---------------- */

/** Raw weight of one exposure before multipliers. */
export const SEVERITY_WEIGHT: Record<ExposureSeverity, number> = {
  critical: 50,
  high: 25,
  medium: 12,
  low: 5,
  info: 1,
};

/** Each further exposure counts this much less than the one before it (sorted by weight): diminishing returns. */
export const DECAY = 0.7;

/** Saturation constant: score = 100 · (1 − e^(−raw / K)). One recent open critical ≈ 67 (High). */
export const SATURATION_K = 45;

/** Remediated exposures keep residual weight (spec Part 9); dismissed keep more, since nothing was fixed. */
export const REMEDIATION_MULTIPLIER: Record<RemediationState, number> = {
  open: 1,
  in_progress: 0.7,
  dismissed: 0.5,
  remediated: 0.25,
};

/** A provider stopped reporting it: probably still out there, but less certain. */
export const NO_LONGER_REPORTED_MULTIPLIER = 0.5;

/** Flat raw-point bonuses for compounding risks, applied once each. */
export const BONUS = { activeCredentials: 8, repeatedPasswordExposure: 6, phoneExposure: 3 } as const;

/** MFA (when the user tells us it's on) dampens credential-driven risk. */
export const MFA_MULTIPLIER = 0.85;

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

export function recencyMultiplier(date: Date, now: Date): number {
  const ageYears = (now.getTime() - date.getTime()) / YEAR_MS;
  if (ageYears <= 1) return 1;
  if (ageYears <= 3) return 0.8;
  if (ageYears <= 7) return 0.6;
  return 0.4;
}

const CREDENTIAL_TYPES: readonly ExposedDataType[] = ["password_plaintext", "auth_token"];
const PASSWORD_TYPES: readonly ExposedDataType[] = ["password_plaintext", "password_hash"];

const isOpen = (e: RiskExposureInput) =>
  e.remediationState === "open" || e.remediationState === "in_progress";
const isCurrent = (e: RiskExposureInput) => e.detectionState !== "no_longer_reported";

function exposureWeight(e: RiskExposureInput, now: Date, ignoreRemediation: boolean): number {
  const recency = recencyMultiplier(e.breachDate ?? e.firstSeenAt, now);
  const remediation = ignoreRemediation ? 1 : REMEDIATION_MULTIPLIER[e.remediationState];
  const detection = isCurrent(e) ? 1 : NO_LONGER_REPORTED_MULTIPLIER;
  return SEVERITY_WEIGHT[e.severity] * recency * remediation * detection;
}

function toScore(raw: number): number {
  return normalizeRiskScore(100 * (1 - Math.exp(-Math.max(0, raw) / SATURATION_K)));
}

interface RawBreakdown {
  total: number;
  bySeverity: Record<ExposureSeverity, number>;
  counts: Record<ExposureSeverity, number>;
  bonuses: { activeCredentials: number; repeatedPasswordExposure: number; phoneExposure: number };
}

function rawScore(input: RiskInput, ignoreRemediation: boolean): RawBreakdown {
  const bySeverity: Record<ExposureSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const counts: Record<ExposureSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };

  const weighted = input.exposures
    .map((e) => ({ e, w: exposureWeight(e, input.now, ignoreRemediation) }))
    // Deterministic order: by weight, then severity, then date, so ties can't reorder decay.
    .sort(
      (a, b) =>
        b.w - a.w ||
        SEVERITY_WEIGHT[b.e.severity] - SEVERITY_WEIGHT[a.e.severity] ||
        a.e.firstSeenAt.getTime() - b.e.firstSeenAt.getTime(),
    );

  let total = 0;
  weighted.forEach(({ e, w }, index) => {
    const contribution = w * DECAY ** index;
    total += contribution;
    bySeverity[e.severity] += contribution;
    counts[e.severity] += 1;
  });

  const open = input.exposures.filter((e) => (ignoreRemediation || isOpen(e)) && isCurrent(e));
  const bonuses = {
    activeCredentials: open.some(
      (e) => e.sourceType === "stealer_log" || e.dataTypes.some((t) => CREDENTIAL_TYPES.includes(t)),
    )
      ? BONUS.activeCredentials
      : 0,
    repeatedPasswordExposure:
      open.filter((e) => e.dataTypes.some((t) => PASSWORD_TYPES.includes(t))).length >= 3
        ? BONUS.repeatedPasswordExposure
        : 0,
    phoneExposure: open.some((e) => e.dataTypes.includes("phone")) ? BONUS.phoneExposure : 0,
  };
  total += bonuses.activeCredentials + bonuses.repeatedPasswordExposure + bonuses.phoneExposure;

  if (input.mfaEnabled === true) total *= MFA_MULTIPLIER;
  return { total, bySeverity, counts, bonuses };
}

const SEVERITY_LABEL: Record<ExposureSeverity, string> = {
  critical: "Critical exposures",
  high: "High exposures",
  medium: "Medium exposures",
  low: "Low exposures",
  info: "Informational exposures",
};

export function calculateRiskScore(input: RiskInput): RiskScoreResult {
  if (input.exposures.length === 0) {
    return {
      score: 0,
      band: "minimal",
      methodologyVersion: RISK_METHODOLOGY_VERSION,
      factors: [
        {
          key: "no_exposures",
          label: "No known exposures",
          points: 0,
          detail:
            "Nothing found in the sources checked. That isn't a guarantee, only the absence of known reports.",
        },
      ],
    };
  }

  const raw = rawScore(input, false);
  const score = toScore(raw.total);
  // Spread the final score across raw contributions so the factor points add up to the score.
  const scale = raw.total > 0 ? score / raw.total : 0;
  const mfaScale = input.mfaEnabled === true ? MFA_MULTIPLIER : 1;
  const pts = (rawPoints: number) => Math.round(rawPoints * mfaScale * scale);

  const factors: RiskFactor[] = [];
  for (const severity of ["critical", "high", "medium", "low", "info"] as const) {
    if (raw.counts[severity] === 0) continue;
    factors.push({
      key: `severity_${severity}`,
      label: SEVERITY_LABEL[severity],
      points: pts(raw.bySeverity[severity]),
      detail: `${raw.counts[severity]} exposure${raw.counts[severity] === 1 ? "" : "s"}, weighted by how recent ${raw.counts[severity] === 1 ? "it is" : "they are"} and what you've done about ${raw.counts[severity] === 1 ? "it" : "them"}. Each additional exposure counts a little less.`,
    });
  }
  if (raw.bonuses.activeCredentials) {
    factors.push({
      key: "active_credentials",
      label: "Usable credentials exposed",
      points: pts(raw.bonuses.activeCredentials),
      detail:
        "A readable password, session token or malware log is still open. Anyone holding it may be able to sign in.",
    });
  }
  if (raw.bonuses.repeatedPasswordExposure) {
    factors.push({
      key: "repeated_password_exposure",
      label: "Passwords exposed repeatedly",
      points: pts(raw.bonuses.repeatedPasswordExposure),
      detail: "Passwords appear in 3 or more open exposures. Reused passwords make each one more dangerous.",
    });
  }
  if (raw.bonuses.phoneExposure) {
    factors.push({
      key: "phone_exposure",
      label: "Phone number exposed",
      points: pts(raw.bonuses.phoneExposure),
      detail: "Exposed phone numbers enable SMS phishing and SIM-swap attempts.",
    });
  }

  // How much remediation has already lowered the score (never zero for remediated items: residual risk).
  const withoutRemediation = toScore(rawScore(input, true).total);
  if (withoutRemediation > score) {
    factors.push({
      key: "remediation_credit",
      label: "Your remediation progress",
      points: score - withoutRemediation,
      detail:
        "Exposures you've fixed or are fixing count for less. Fixed ones keep a little weight, because the data is still out there.",
    });
  }
  if (input.mfaEnabled === true) {
    factors.push({
      key: "mfa_enabled",
      label: "Two-factor authentication on",
      points: 0,
      detail:
        "You told us two-factor authentication is on, which lowers the risk of exposed passwords (already reflected above).",
    });
  } else if (input.mfaEnabled == null) {
    factors.push({
      key: "mfa_unknown",
      label: "Two-factor status not known",
      points: 0,
      detail:
        "We don't know whether your accounts use two-factor authentication, so it isn't counted either way.",
    });
  }

  return { score, band: riskBandForScore(score), factors, methodologyVersion: RISK_METHODOLOGY_VERSION };
}
