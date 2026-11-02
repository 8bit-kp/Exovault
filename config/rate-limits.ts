/**
 * Rate-limit policy (spec 12.3). One place to tune; documented in docs/SECURITY.md.
 * `failClosed` rules reject requests when Redis is unavailable.
 */
export interface RateLimitRule {
  /** Stable name; part of the Redis key. */
  name: string;
  limit: number;
  windowMs: number;
  failClosed: boolean;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const RATE_LIMITS = {
  signInPerIp: { name: "sign-in:ip", limit: 5, windowMs: 15 * MINUTE, failClosed: true },
  signInPerAccount: { name: "sign-in:account", limit: 5, windowMs: 15 * MINUTE, failClosed: true },
  signUpPerIp: { name: "sign-up:ip", limit: 5, windowMs: HOUR, failClosed: true },
  verificationResendPerAccount: { name: "verify-resend:account", limit: 3, windowMs: HOUR, failClosed: true },
  passwordResetPerAccount: { name: "password-reset:account", limit: 3, windowMs: HOUR, failClosed: true },
  passwordResetPerIp: { name: "password-reset:ip", limit: 3, windowMs: HOUR, failClosed: true },
  identityCreationPerUser: { name: "identity-create:user", limit: 5, windowMs: DAY, failClosed: true },
  // Ownership codes: 5 guesses per code (stored on the code) plus this per-user ceiling across codes.
  identityCodeAttemptsPerUser: {
    name: "identity-code:user",
    limit: 10,
    windowMs: 15 * MINUTE,
    failClosed: true,
  },
  identityCodeResendPerIdentity: {
    name: "identity-resend:identity",
    limit: 3,
    windowMs: HOUR,
    failClosed: true,
  },
  // "Retry failed source" on a partial scan; separate from the 15-min manual cooldown (D-029).
  scanRetryPerIdentity: { name: "scan-retry:identity", limit: 3, windowMs: HOUR, failClosed: true },

  // Phase 11 hardening (D-035).
  // Per address, not per account: stops one person flooding someone else's inbox from many accounts.
  signUpPerEmail: { name: "sign-up:email", limit: 3, windowMs: HOUR, failClosed: true },
  identityCodeIssuePerAddress: {
    name: "identity-code-issue:address",
    limit: 5,
    windowMs: DAY,
    failClosed: true,
  },
  identityCodeAttemptsPerAddress: {
    name: "identity-code:address",
    limit: 10,
    windowMs: 15 * MINUTE,
    failClosed: true,
  },
  passwordResetSubmitPerIp: { name: "password-reset-submit:ip", limit: 10, windowMs: HOUR, failClosed: true },
  // Audited, decrypting actions: generous for people, a ceiling for scripts.
  revealPerUser: { name: "reveal:user", limit: 30, windowMs: HOUR, failClosed: true },
  unsubscribePerIp: { name: "unsubscribe:ip", limit: 20, windowMs: HOUR, failClosed: true },
  scanStreamsPerUser: { name: "scan-stream:user", limit: 30, windowMs: 5 * MINUTE, failClosed: true },

  // Phase 13: account privacy (spec 5.2).
  // Password re-entry before deleting the account: same budget as sign-in, per user.
  reauthPerUser: { name: "reauth:user", limit: 5, windowMs: 15 * MINUTE, failClosed: true },
  // Each export decrypts every identifier: a few an hour is plenty.
  dataExportPerUser: { name: "data-export:user", limit: 5, windowMs: HOUR, failClosed: true },
} as const satisfies Record<string, RateLimitRule>;
