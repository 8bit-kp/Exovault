import type { ExposedDataType, ExposureSeverity, ExposureSourceType } from "./exposure";

/**
 * Severity classifier (spec 7.6). Our own, deterministic matrix: provider
 * opinions about severity are never used (D-006). Documented with every rule
 * in docs/EXPOSURE-ENGINE.md; each rule has a unit test.
 */

export const SEVERITY_RANK: Record<ExposureSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};
const BY_RANK: ExposureSeverity[] = ["info", "low", "medium", "high", "critical"];

export const SEVERITY_LABELS: Record<ExposureSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

export const SEVERITY_METHODOLOGY_VERSION = "2026-10.1";

export interface SeverityInput {
  dataTypes: readonly ExposedDataType[];
  sourceType: ExposureSourceType;
}

export interface SeverityResult {
  severity: ExposureSeverity;
  /** Which rule decided it; shown in "Why this severity?" and asserted in tests. */
  reason: string;
}

const CRITICAL_TYPES: ExposedDataType[] = ["password_plaintext", "auth_token", "security_qa", "financial"];
const HIGH_TYPES: ExposedDataType[] = ["password_hash", "government_id", "mfa_backup_codes"];
const MEDIUM_TYPES: ExposedDataType[] = ["phone", "date_of_birth", "ip_address", "physical_address"];

export function classifySeverity({ dataTypes, sourceType }: SeverityInput): SeverityResult {
  const has = (type: ExposedDataType) => dataTypes.includes(type);

  if (sourceType === "stealer_log") {
    return { severity: "critical", reason: "Found in infostealer malware logs, which hold live credentials" };
  }
  const critical = CRITICAL_TYPES.find(has);
  if (critical) return { severity: "critical", reason: `Exposed data includes ${critical}` };

  if (has("physical_address") && has("phone")) {
    return { severity: "high", reason: "Home address and phone number exposed together" };
  }
  const high = HIGH_TYPES.find(has);
  if (high) return { severity: "high", reason: `Exposed data includes ${high}` };

  if (has("username") && has("email")) {
    return { severity: "medium", reason: "Username and email exposed together" };
  }
  const medium = MEDIUM_TYPES.find(has);
  if (medium) return { severity: "medium", reason: `Exposed data includes ${medium}` };

  if (dataTypes.length === 0)
    return { severity: "info", reason: "Source known; no personal data categories confirmed" };
  return { severity: "low", reason: "Only low-sensitivity data (e.g. email address, name, profile details)" };
}

const SEVEN_YEARS_MS = 7 * 365.25 * 24 * 60 * 60 * 1000;

/**
 * Display priority (spec 7.6 modifier): exposures whose incident is more than
 * 7 years old sort one level lower, never below Low. Severity itself is
 * unchanged; this only orders lists.
 */
export function displayPriority(
  severity: ExposureSeverity,
  breachDate: Date | null | undefined,
  now: Date,
): ExposureSeverity {
  if (!breachDate || now.getTime() - breachDate.getTime() <= SEVEN_YEARS_MS) return severity;
  const rank = SEVERITY_RANK[severity];
  return rank <= SEVERITY_RANK.low ? severity : BY_RANK[rank - 1];
}

export function maxSeverity(a: ExposureSeverity, b: ExposureSeverity): ExposureSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}
