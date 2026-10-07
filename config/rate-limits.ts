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
} as const satisfies Record<string, RateLimitRule>;
