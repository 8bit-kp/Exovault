import "server-only";
import { randomInt, timingSafeEqual } from "node:crypto";
import { Types } from "mongoose";
import { getEnv } from "@/config/env";
import { RATE_LIMITS, type RateLimitRule } from "@/config/rate-limits";
import { recordAuditEvent } from "@/lib/audit";
import { decryptField, encryptField } from "@/lib/crypto/field-encryption";
import { keyedHash } from "@/lib/crypto/keyed-hash";
import { emailIdentifierSchema, normalizeIdentifier } from "@/lib/domain/identifier";
import { logger } from "@/lib/logging/logger";
import { limit, RateLimitUnavailableError } from "@/lib/rate-limit";
import { maskEmail } from "@/lib/utils/mask";
import { getEmailProvider } from "@/server/providers/email";
import {
  claimIdentitySlot,
  consumeVerificationCode,
  deleteIdentityForUser,
  DuplicateIdentityError,
  findActiveByBlindIndex,
  findActiveIdentityForUser,
  insertIdentity,
  listActiveIdentitiesForUser,
  markIdentityVerified,
  releaseIdentitySlot,
  spendVerificationAttempt,
  upsertVerificationCode,
  type IdentityRecord,
} from "@/server/repositories/identity-repository";
import { identityVerificationMessage } from "@/server/services/notification/auth-emails";
import { recomputeRiskScore } from "@/server/services/risk/risk-service";
import { IDENTITY_CODE_MAX_ATTEMPTS, IDENTITY_CODE_TTL_SECONDS } from "@/models/IdentityVerification";
import type { IdentityView } from "@/components/identity/identity-card";

/**
 * Monitored identifiers (spec 5.1, Part 6 #2).
 *
 * Plaintext exists only in memory, and only at three audited points: when the
 * user submits it (to encrypt it and email the code), when a code is resent
 * (to address the email), and on an explicit "reveal" (D-023). The scan
 * service is the fourth, from Phase 6.
 */

export interface Actor {
  userId: string;
  /** The verified sign-in email: an identity equal to it needs no second proof. */
  accountEmail: string;
  accountEmailVerified: boolean;
}

export interface Ctx {
  ip: string;
  requestId: string | null;
}

type Blocked =
  { ok: false; reason: "rate_limited"; retryAfterSeconds: number } | { ok: false; reason: "unavailable" };

export type AddIdentityResult =
  | { ok: true; identityId: string; verification: "verified" | "pending" }
  | Blocked
  | { ok: false; reason: "invalid"; message: string }
  | { ok: false; reason: "duplicate" | "limit_reached" | "error" };

export type VerifyIdentityResult =
  { ok: true } | Blocked | { ok: false; reason: "not_found" | "already_verified" | "expired" | "invalid" };

const aadFor = (identityId: Types.ObjectId | string) => `identity:${String(identityId)}`;
const blindIndex = (type: "email", normalized: string) =>
  keyedHash("identity-blind-index", `${type}:${normalized}`);
const codeHash = (identityId: Types.ObjectId, code: string) =>
  keyedHash("identity-verification-code", `${identityId.toHexString()}:${code}`);

async function check(
  rule: RateLimitRule,
  subject: string,
  actor: { userId: string },
  ctx: Ctx,
): Promise<Blocked | null> {
  try {
    const result = await limit(rule, subject);
    if (result.allowed) return null;
    await recordAuditEvent({
      event: "RATE_LIMITED",
      outcome: "denied",
      userId: actor.userId,
      requestId: ctx.requestId,
      metadata: { rule: rule.name },
    });
    return { ok: false, reason: "rate_limited", retryAfterSeconds: Math.ceil(result.retryAfterMs / 1000) };
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) return { ok: false, reason: "unavailable" };
    throw error;
  }
}

function toView(record: IdentityRecord): IdentityView {
  return {
    id: record._id.toHexString(),
    type: record.type,
    masked: record.valueMasked,
    verification: record.verificationStatus,
    monitoring: "off",
    lastScanAt: record.lastScanAt ? record.lastScanAt.toISOString() : null,
    activeExposures: 0,
  };
}

async function issueCode(identityId: Types.ObjectId, userId: string, to: string, ctx: Ctx): Promise<void> {
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await upsertVerificationCode({
    identityId,
    userId,
    codeHash: codeHash(identityId, code),
    expiresAt: new Date(Date.now() + IDENTITY_CODE_TTL_SECONDS * 1000),
  });
  await getEmailProvider().send(identityVerificationMessage(to, code));
  await recordAuditEvent({
    event: "IDENTITY_VERIFICATION_SENT",
    outcome: "success",
    userId,
    requestId: ctx.requestId,
    metadata: { identityId: identityId.toHexString() },
  });
}

export async function addEmailIdentity(
  actor: Actor,
  rawValue: unknown,
  ctx: Ctx,
): Promise<AddIdentityResult> {
  const parsed = emailIdentifierSchema.safeParse(rawValue);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid",
      message: parsed.error.issues[0]?.message ?? "Enter a valid email address.",
    };
  }
  const value = parsed.data;

  // Counted before the duplicate check, so probing with repeated adds is rate limited too.
  const blocked = await check(RATE_LIMITS.identityCreationPerUser, actor.userId, actor, ctx);
  if (blocked) return blocked;

  const index = blindIndex("email", value);
  if (await findActiveByBlindIndex(actor.userId, "email", index)) return { ok: false, reason: "duplicate" };

  if (!(await claimIdentitySlot(actor.userId, getEnv().MAX_ACTIVE_IDENTITIES_PER_USER))) {
    return { ok: false, reason: "limit_reached" };
  }

  const _id = new Types.ObjectId();
  const matchesAccount =
    actor.accountEmailVerified && normalizeIdentifier("email", actor.accountEmail) === value;
  const now = new Date();
  try {
    await insertIdentity({
      _id,
      userId: actor.userId,
      type: "email",
      valueEncrypted: encryptField(value, aadFor(_id)),
      valueBlindIndex: index,
      valueMasked: maskEmail(value),
      verified: matchesAccount ? { method: "account-email", at: now } : null,
    });
  } catch (error) {
    await releaseIdentitySlot(actor.userId);
    if (error instanceof DuplicateIdentityError) return { ok: false, reason: "duplicate" };
    logger.error(
      { requestId: ctx.requestId, err: error instanceof Error ? error.name : "unknown" },
      "identity insert failed",
    );
    return { ok: false, reason: "error" };
  }

  const identityId = _id.toHexString();
  await recordAuditEvent({
    event: "IDENTITY_ADDED",
    outcome: "success",
    userId: actor.userId,
    requestId: ctx.requestId,
    metadata: { identityId, type: "email" },
  });

  if (matchesAccount) {
    await recordAuditEvent({
      event: "IDENTITY_VERIFIED",
      outcome: "success",
      userId: actor.userId,
      requestId: ctx.requestId,
      metadata: { identityId, method: "account-email" },
    });
    return { ok: true, identityId, verification: "verified" };
  }

  try {
    await issueCode(_id, actor.userId, value, ctx);
  } catch (error) {
    // The identity exists and stays pending; the user can resend.
    logger.error(
      { requestId: ctx.requestId, err: error instanceof Error ? error.name : "unknown" },
      "identity code email failed",
    );
  }
  return { ok: true, identityId, verification: "pending" };
}

export async function verifyIdentityCode(
  actor: Pick<Actor, "userId">,
  identityId: string,
  rawCode: unknown,
  ctx: Ctx,
): Promise<VerifyIdentityResult> {
  const identity = await findActiveIdentityForUser(actor.userId, identityId);
  if (!identity) return { ok: false, reason: "not_found" };
  if (identity.verificationStatus === "verified") return { ok: false, reason: "already_verified" };

  const blocked = await check(RATE_LIMITS.identityCodeAttemptsPerUser, actor.userId, actor, ctx);
  if (blocked) return blocked;

  const code = typeof rawCode === "string" ? rawCode.trim() : "";
  const attempt = await spendVerificationAttempt(
    actor.userId,
    identity._id,
    IDENTITY_CODE_MAX_ATTEMPTS,
    new Date(),
  );
  if (!attempt) return { ok: false, reason: "expired" };

  const expected = Buffer.from(attempt.codeHash, "hex");
  const actual = Buffer.from(codeHash(identity._id, /^\d{6}$/.test(code) ? code : "invalid"), "hex");
  if (!timingSafeEqual(expected, actual)) {
    await recordAuditEvent({
      event: "IDENTITY_VERIFIED",
      outcome: "failure",
      userId: actor.userId,
      requestId: ctx.requestId,
      metadata: { identityId, attempts: attempt.attempts },
    });
    return { ok: false, reason: attempt.attempts >= IDENTITY_CODE_MAX_ATTEMPTS ? "expired" : "invalid" };
  }

  if (!(await consumeVerificationCode(attempt._id))) return { ok: false, reason: "expired" };
  if (!(await markIdentityVerified(actor.userId, identity._id, new Date())))
    return { ok: false, reason: "already_verified" };

  await recordAuditEvent({
    event: "IDENTITY_VERIFIED",
    outcome: "success",
    userId: actor.userId,
    requestId: ctx.requestId,
    metadata: { identityId, method: "code" },
  });
  return { ok: true };
}

export async function resendIdentityCode(
  actor: Pick<Actor, "userId">,
  identityId: string,
  ctx: Ctx,
): Promise<{ ok: true } | Blocked | { ok: false; reason: "not_found" | "already_verified" | "error" }> {
  const identity = await findActiveIdentityForUser(actor.userId, identityId);
  if (!identity) return { ok: false, reason: "not_found" };
  if (identity.verificationStatus === "verified") return { ok: false, reason: "already_verified" };

  const blocked = await check(
    RATE_LIMITS.identityCodeResendPerIdentity,
    identity._id.toHexString(),
    actor,
    ctx,
  );
  if (blocked) return blocked;

  try {
    // Decrypted only to address the email; never returned or logged (D-023).
    const to = decryptField(identity.valueEncrypted, aadFor(identity._id));
    await issueCode(identity._id, actor.userId, to, ctx);
    return { ok: true };
  } catch (error) {
    logger.error(
      { requestId: ctx.requestId, err: error instanceof Error ? error.name : "unknown" },
      "identity code resend failed",
    );
    return { ok: false, reason: "error" };
  }
}

/** Explicit, audited reveal of the full value inside the signed-in session (spec 5.1). */
export async function revealIdentity(
  actor: Pick<Actor, "userId">,
  identityId: string,
  ctx: Ctx,
): Promise<{ ok: true; value: string } | { ok: false; reason: "not_found" | "error" }> {
  const identity = await findActiveIdentityForUser(actor.userId, identityId);
  if (!identity) return { ok: false, reason: "not_found" };
  try {
    const value = decryptField(identity.valueEncrypted, aadFor(identity._id));
    await recordAuditEvent({
      event: "IDENTITY_REVEALED",
      outcome: "success",
      userId: actor.userId,
      requestId: ctx.requestId,
      metadata: { identityId },
    });
    return { ok: true, value };
  } catch (error) {
    logger.error(
      { requestId: ctx.requestId, err: error instanceof Error ? error.name : "unknown" },
      "identity reveal failed",
    );
    return { ok: false, reason: "error" };
  }
}

export async function removeIdentity(
  actor: Pick<Actor, "userId">,
  identityId: string,
  ctx: Ctx,
): Promise<{ ok: true } | { ok: false; reason: "not_found" }> {
  if (!(await deleteIdentityForUser(actor.userId, identityId))) return { ok: false, reason: "not_found" };
  await releaseIdentitySlot(actor.userId);
  // Its exposures are gone, so the score changes too.
  await recomputeRiskScore(actor.userId, "identity_removed");
  await recordAuditEvent({
    event: "IDENTITY_REMOVED",
    outcome: "success",
    userId: actor.userId,
    requestId: ctx.requestId,
    metadata: { identityId },
  });
  return { ok: true };
}

/**
 * Runs `fn` with the decrypted identifier, for the scan engine only (spec 5.1):
 * the value lives in this call's memory and is never returned. Refuses
 * identities that aren't verified (spec 2.3: ownership before any lookup).
 */
export async function withDecryptedIdentity<T>(
  userId: string,
  identityId: string,
  fn: (identifier: { type: "email"; normalizedValue: string }) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; reason: "not_found" | "not_verified" }> {
  const identity = await findActiveIdentityForUser(userId, identityId);
  if (!identity) return { ok: false, reason: "not_found" };
  if (identity.verificationStatus !== "verified") return { ok: false, reason: "not_verified" };
  const normalizedValue = decryptField(identity.valueEncrypted, aadFor(identity._id));
  return { ok: true, value: await fn({ type: "email", normalizedValue }) };
}

export async function listIdentities(userId: string): Promise<IdentityView[]> {
  return (await listActiveIdentitiesForUser(userId)).map(toView);
}

export async function getIdentity(userId: string, identityId: string): Promise<IdentityView | null> {
  const record = await findActiveIdentityForUser(userId, identityId);
  return record ? toView(record) : null;
}
