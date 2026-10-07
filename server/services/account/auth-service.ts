import "server-only";
import { isAPIError } from "better-auth/api";
import { RATE_LIMITS, type RateLimitRule } from "@/config/rate-limits";
import { recordAuditEvent } from "@/lib/audit";
import { getEnv } from "@/config/env";
import { getAuth } from "@/lib/auth/server";
import { isPasswordCompromised } from "better-auth/plugins/haveibeenpwned";
import {
  clearSignupNonce,
  findAuthUserByEmail,
  issueSignupNonce,
  signupNonceMatches,
} from "@/lib/auth/signup-binding";
import { logger } from "@/lib/logging/logger";
import { limit, RateLimitUnavailableError } from "@/lib/rate-limit";

/**
 * Account flows. Server Actions are thin wrappers around these: validate (Zod)
 * → here: rate-limit → Better Auth (in-process) → audit → safe result. Results
 * never reveal whether an account exists (spec Part 6), except after a correct
 * password, where "not verified yet" is shown to its owner.
 */

export interface RequestContext {
  /** Incoming request headers: carry the session cookie and Origin for Better Auth's checks. */
  headers: Headers;
  ip: string;
  requestId: string | null;
}

export type AuthResult<T extends string = never> =
  | {
      ok: true;
      next?: T;
      /** Signup-binding nonce for the pending-verification cookie (D-034). */ nonce?: string | null;
    }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number }
  | { ok: false; reason: "unavailable" }
  | {
      ok: false;
      reason: "invalid" | "compromised_password" | "expired" | "not_verified" | "error";
      message?: string;
    };

type Blocked = Extract<AuthResult, { reason: "rate_limited" | "unavailable" }>;

/** Applies every rule; returns the first block, or null when all allow. Fails closed. */
async function checkLimits(
  checks: Array<[RateLimitRule, string]>,
  ctx: RequestContext,
  subject?: string,
): Promise<Blocked | null> {
  for (const [rule, key] of checks) {
    try {
      const result = await limit(rule, key);
      if (!result.allowed) {
        await recordAuditEvent({
          event: "RATE_LIMITED",
          outcome: "denied",
          subject,
          ip: ctx.ip,
          requestId: ctx.requestId,
          metadata: { rule: rule.name },
        });
        return {
          ok: false,
          reason: "rate_limited",
          retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000),
        };
      }
    } catch (error) {
      if (error instanceof RateLimitUnavailableError) {
        logger.error(
          { rule: rule.name, requestId: ctx.requestId },
          "rate limiter unavailable; failing closed",
        );
        return { ok: false, reason: "unavailable" };
      }
      throw error;
    }
  }
  return null;
}

function apiErrorCode(error: unknown): string | undefined {
  if (!isAPIError(error)) return undefined;
  const body = error.body as { code?: unknown } | undefined;
  return typeof body?.code === "string" ? body.code : undefined;
}

function unexpected(error: unknown, operation: string, ctx: RequestContext): AuthResult {
  logger.error(
    {
      operation,
      requestId: ctx.requestId,
      err: error instanceof Error ? error.name : "unknown",
      code: apiErrorCode(error),
    },
    "auth operation failed",
  );
  return { ok: false, reason: "error" };
}

/**
 * Sign-up (D-034). Three cases, one response:
 *  - new address: create the account, bind verification to this browser (nonce);
 *  - existing UNVERIFIED account: don't touch it; email the mailbox owner a
 *    set-your-password link instead of a code. Whoever set the old password
 *    (possibly an attacker pre-registering someone else's address) loses it
 *    when the owner uses that link;
 *  - existing verified account: "you already have an account" email.
 * A password hash runs in every branch so response time doesn't reveal which.
 */
export async function signUp(
  input: { email: string; password: string },
  ctx: RequestContext,
): Promise<AuthResult> {
  const blocked = await checkLimits(
    [
      [RATE_LIMITS.signUpPerIp, ctx.ip],
      [RATE_LIMITS.signUpPerEmail, input.email],
    ],
    ctx,
    input.email,
  );
  if (blocked) return blocked;
  try {
    const existing = await findAuthUserByEmail(input.email);
    if (existing && !existing.emailVerified) {
      await (await getAuth().$context).password.hash(input.password);
      const resetBudget = await limit(RATE_LIMITS.passwordResetPerAccount, input.email).catch(() => null);
      if (resetBudget?.allowed) {
        await getAuth().api.requestPasswordReset({ body: { email: input.email }, headers: ctx.headers });
      }
      return { ok: true, nonce: null };
    }
    // New address, or existing verified one (Better Auth's generic duplicate path sends "account exists").
    await getAuth().api.signUpEmail({
      body: { email: input.email, password: input.password, name: "" },
      headers: ctx.headers,
    });
    if (existing) return { ok: true, nonce: null };
    const created = await findAuthUserByEmail(input.email);
    return { ok: true, nonce: created ? await issueSignupNonce(created.id) : null };
  } catch (error) {
    if (apiErrorCode(error) === "PASSWORD_COMPROMISED") return { ok: false, reason: "compromised_password" };
    if (apiErrorCode(error) === "PASSWORD_TOO_SHORT" || apiErrorCode(error) === "PASSWORD_TOO_LONG") {
      return { ok: false, reason: "invalid" };
    }
    return unexpected(error, "sign-up", ctx);
  }
}

export async function verifyEmailCode(
  input: { email: string; code: string; nonce: string | null | undefined },
  ctx: RequestContext,
): Promise<AuthResult> {
  // Shares the sign-in budget: guessing codes is a sign-in attempt.
  const blocked = await checkLimits(
    [
      [RATE_LIMITS.signInPerIp, ctx.ip],
      [RATE_LIMITS.signInPerAccount, input.email],
    ],
    ctx,
    input.email,
  );
  if (blocked) return blocked;
  const user = await findAuthUserByEmail(input.email);
  // A code only verifies the account this browser created or proved the password for (D-034).
  if (!user || !(await signupNonceMatches(user.id, input.nonce))) {
    await recordAuditEvent({
      event: "LOGIN_FAILED",
      outcome: "failure",
      subject: input.email,
      ip: ctx.ip,
      requestId: ctx.requestId,
      metadata: { method: "email-verification", reason: "unbound" },
    });
    return { ok: false, reason: "invalid" };
  }
  try {
    const result = await getAuth().api.verifyEmailOTP({
      body: { email: input.email, otp: input.code },
      headers: ctx.headers,
    });
    await recordAuditEvent({
      event: "LOGIN_SUCCESS",
      outcome: "success",
      userId: result.user?.id ?? null,
      ip: ctx.ip,
      requestId: ctx.requestId,
      metadata: { method: "email-verification" },
    });
    await clearSignupNonce(user.id);
    return { ok: true };
  } catch (error) {
    const code = apiErrorCode(error);
    if (code === "OTP_EXPIRED" || code === "TOO_MANY_ATTEMPTS") return { ok: false, reason: "expired" };
    if (
      code === "INVALID_OTP" ||
      code === "USER_NOT_FOUND" ||
      code === "INVALID_EMAIL" ||
      code === "ALREADY_VERIFIED"
    ) {
      await recordAuditEvent({
        event: "LOGIN_FAILED",
        outcome: "failure",
        subject: input.email,
        ip: ctx.ip,
        requestId: ctx.requestId,
        metadata: { method: "email-verification" },
      });
      return { ok: false, reason: "invalid" };
    }
    return unexpected(error, "verify-email", ctx);
  }
}

/**
 * Sends a fresh code only for an unverified account bound to this browser.
 * The response is the same either way (no enumeration, no unsolicited codes).
 */
export async function resendVerificationCode(
  input: { email: string; nonce: string | null | undefined },
  ctx: RequestContext,
): Promise<AuthResult> {
  const blocked = await checkLimits(
    [[RATE_LIMITS.verificationResendPerAccount, input.email]],
    ctx,
    input.email,
  );
  if (blocked) return blocked;
  try {
    const user = await findAuthUserByEmail(input.email);
    if (user && !user.emailVerified && (await signupNonceMatches(user.id, input.nonce))) {
      await getAuth().api.sendVerificationOTP({
        body: { email: input.email, type: "email-verification" },
        headers: ctx.headers,
      });
    }
    return { ok: true };
  } catch (error) {
    return unexpected(error, "resend-verification", ctx);
  }
}

export async function signIn(
  input: { email: string; password: string },
  ctx: RequestContext,
): Promise<AuthResult<"verify-email">> {
  const blocked = await checkLimits(
    [
      [RATE_LIMITS.signInPerIp, ctx.ip],
      [RATE_LIMITS.signInPerAccount, input.email],
    ],
    ctx,
    input.email,
  );
  if (blocked) return blocked;
  try {
    const result = await getAuth().api.signInEmail({
      body: { email: input.email, password: input.password, rememberMe: true },
      headers: ctx.headers,
    });
    await recordAuditEvent({
      event: "LOGIN_SUCCESS",
      outcome: "success",
      userId: result.user.id,
      ip: ctx.ip,
      requestId: ctx.requestId,
      metadata: { method: "password" },
    });
    return { ok: true };
  } catch (error) {
    const code = apiErrorCode(error);
    if (code === "EMAIL_NOT_VERIFIED") {
      // The password was right, so this browser is bound to the account: issue a nonce and a fresh code.
      const user = await findAuthUserByEmail(input.email);
      if (!user) return { ok: false, reason: "invalid" };
      const nonce = await issueSignupNonce(user.id);
      const resend = await resendVerificationCode({ email: input.email, nonce }, ctx);
      return resend.ok || resend.reason === "rate_limited"
        ? { ok: true, next: "verify-email", nonce }
        : resend;
    }
    if (code === "INVALID_EMAIL_OR_PASSWORD" || code === "INVALID_EMAIL" || code === "INVALID_PASSWORD") {
      await recordAuditEvent({
        event: "LOGIN_FAILED",
        outcome: "failure",
        subject: input.email,
        ip: ctx.ip,
        requestId: ctx.requestId,
        metadata: { method: "password" },
      });
      return { ok: false, reason: "invalid" };
    }
    return unexpected(error, "sign-in", ctx);
  }
}

export async function requestPasswordReset(
  input: { email: string },
  ctx: RequestContext,
): Promise<AuthResult> {
  const blocked = await checkLimits(
    [
      [RATE_LIMITS.passwordResetPerIp, ctx.ip],
      [RATE_LIMITS.passwordResetPerAccount, input.email],
    ],
    ctx,
    input.email,
  );
  if (blocked) return blocked;
  try {
    await getAuth().api.requestPasswordReset({ body: { email: input.email }, headers: ctx.headers });
    await recordAuditEvent({
      event: "PASSWORD_RESET_REQUESTED",
      outcome: "success",
      subject: input.email,
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
    return { ok: true };
  } catch (error) {
    return unexpected(error, "request-password-reset", ctx);
  }
}

export async function resetPassword(
  input: { token: string; password: string },
  ctx: RequestContext,
): Promise<AuthResult> {
  const blocked = await checkLimits([[RATE_LIMITS.passwordResetSubmitPerIp, ctx.ip]], ctx);
  if (blocked) return blocked;
  // Better Auth spends the single-use token before its own breach check runs, so a breached
  // password would burn the link. Check first (D-035).
  if (getEnv().PASSWORD_BREACH_CHECK === "on") {
    try {
      if (await isPasswordCompromised(input.password)) return { ok: false, reason: "compromised_password" };
    } catch {
      return { ok: false, reason: "unavailable" };
    }
  }
  try {
    await getAuth().api.resetPassword({
      body: { token: input.token, newPassword: input.password },
      headers: ctx.headers,
    });
    return { ok: true };
  } catch (error) {
    const code = apiErrorCode(error);
    if (code === "INVALID_TOKEN") return { ok: false, reason: "expired" };
    if (code === "PASSWORD_COMPROMISED") return { ok: false, reason: "compromised_password" };
    if (code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG")
      return { ok: false, reason: "invalid" };
    return unexpected(error, "reset-password", ctx);
  }
}

export async function signOut(ctx: RequestContext, userId: string | null): Promise<void> {
  try {
    await getAuth().api.signOut({ headers: ctx.headers });
  } finally {
    await recordAuditEvent({
      event: "LOGOUT",
      outcome: "success",
      userId,
      ip: ctx.ip,
      requestId: ctx.requestId,
    });
  }
}
