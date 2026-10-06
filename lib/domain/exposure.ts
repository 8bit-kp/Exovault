/**
 * Shared domain vocabulary (safe for client and server). Enums are `as const`
 * arrays so they can drive Zod schemas, Mongoose enums, and UI from one place.
 */

export const IDENTIFIER_TYPES = ["email", "phone", "username"] as const;
export type IdentifierType = (typeof IDENTIFIER_TYPES)[number];

export const EXPOSURE_SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export type ExposureSeverity = (typeof EXPOSURE_SEVERITIES)[number];

export const EXPOSURE_SOURCE_TYPES = ["breach", "combo_list", "stealer_log", "paste", "other"] as const;
export type ExposureSourceType = (typeof EXPOSURE_SOURCE_TYPES)[number];

/** Internal data-category vocabulary. Providers map their own labels onto these. */
export const EXPOSED_DATA_TYPES = [
  "email",
  "name",
  "username",
  "password_plaintext",
  "password_hash",
  "auth_token",
  "security_qa",
  "financial",
  "government_id",
  "physical_address",
  "phone",
  "date_of_birth",
  "ip_address",
  "mfa_backup_codes",
  "profile",
  "other",
] as const;
export type ExposedDataType = (typeof EXPOSED_DATA_TYPES)[number];

/** What the providers report (system-driven). */
export const DETECTION_STATES = ["new", "existing", "changed", "no_longer_reported"] as const;
export type DetectionState = (typeof DETECTION_STATES)[number];

/** What the user has done about it (user-driven). */
export const REMEDIATION_STATES = ["open", "in_progress", "remediated", "dismissed"] as const;
export type RemediationState = (typeof REMEDIATION_STATES)[number];

export const SCAN_STATES = [
  "queued",
  "running",
  "normalizing",
  "matching",
  "scoring",
  "completed",
  "partial",
  "failed",
] as const;
export type ScanState = (typeof SCAN_STATES)[number];

export const TERMINAL_SCAN_STATES: readonly ScanState[] = ["completed", "partial", "failed"];

/**
 * The single definition of an "active" exposure (spec Part 7.7): still reported
 * by a provider, and not closed by the user.
 */
export function isActiveExposure(exposure: {
  detectionState: DetectionState;
  remediationState: RemediationState;
}): boolean {
  return (
    exposure.detectionState !== "no_longer_reported" &&
    exposure.remediationState !== "remediated" &&
    exposure.remediationState !== "dismissed"
  );
}
