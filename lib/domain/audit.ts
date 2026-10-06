/** Audit event vocabulary (spec 12.5). Values are stored, so never rename one; add new ones. */
export const AUDIT_EVENTS = [
  "USER_CREATED",
  "LOGIN_SUCCESS",
  "LOGIN_FAILED",
  "LOGOUT",
  "EMAIL_VERIFIED",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_RESET_COMPLETED",
  "SESSIONS_REVOKED",
  "RATE_LIMITED",
  "IDENTITY_ADDED",
  "IDENTITY_VERIFIED",
  "IDENTITY_VERIFICATION_SENT",
  "IDENTITY_REVEALED",
  "IDENTITY_REMOVED",
  "SCAN_STARTED",
  "SCAN_COMPLETED",
  "SCAN_FAILED",
  "EXPOSURE_DETECTED",
  "MONITORING_ENABLED",
  "MONITORING_DISABLED",
  "NOTIFICATION_SENT",
  "ACCOUNT_SETTINGS_CHANGED",
  "DATA_EXPORTED",
  "ACCOUNT_DELETION_REQUESTED",
  "ACCOUNT_DELETED",
] as const;
export type AuditEvent = (typeof AUDIT_EVENTS)[number];

export const AUDIT_OUTCOMES = ["success", "failure", "denied"] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];
