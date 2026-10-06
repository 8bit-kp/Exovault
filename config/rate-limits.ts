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
} as const satisfies Record<string, RateLimitRule>;
