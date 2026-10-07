import "server-only";
import mongoose, { Types } from "mongoose";
import { connectToDatabase } from "@/lib/db/mongoose";
import type { IdentifierType } from "@/lib/domain/exposure";
import type { EncryptedValue } from "@/lib/crypto/field-encryption";
import { Exposure } from "@/models/Exposure";
import { RemediationAction } from "@/models/RemediationAction";
import { Identity, type IdentityDoc } from "@/models/Identity";
import { IdentityQuota } from "@/models/IdentityQuota";
import { IdentityVerification } from "@/models/IdentityVerification";

/**
 * Identity persistence. Every function takes `userId` and scopes by it
 * (spec 12.1); another user's identity is indistinguishable from a missing one.
 * IDs from the client are validated here, so a malformed ID is just "not found".
 */

export type IdentityRecord = IdentityDoc & { _id: Types.ObjectId };

function objectId(id: string): Types.ObjectId | null {
  return Types.ObjectId.isValid(id) && new Types.ObjectId(id).toHexString() === id
    ? new Types.ObjectId(id)
    : null;
}

export async function findActiveIdentityForUser(
  userId: string,
  identityId: string,
): Promise<IdentityRecord | null> {
  const _id = objectId(identityId);
  if (!_id) return null;
  await connectToDatabase();
  return Identity.findOne({ _id, userId, status: "active" }).lean<IdentityRecord>();
}

export async function listActiveIdentitiesForUser(userId: string): Promise<IdentityRecord[]> {
  await connectToDatabase();
  return Identity.find({ userId, status: "active" })
    .sort({ createdAt: 1 })
    .limit(50)
    .lean<IdentityRecord[]>();
}

export async function findActiveByBlindIndex(
  userId: string,
  type: IdentifierType,
  valueBlindIndex: string,
): Promise<IdentityRecord | null> {
  await connectToDatabase();
  return Identity.findOne({ userId, type, valueBlindIndex, status: "active" }).lean<IdentityRecord>();
}

export class DuplicateIdentityError extends Error {
  constructor() {
    super("Identity already exists for this user");
    this.name = "DuplicateIdentityError";
  }
}

export async function insertIdentity(input: {
  _id: Types.ObjectId;
  userId: string;
  type: IdentifierType;
  valueEncrypted: EncryptedValue;
  valueBlindIndex: string;
  valueMasked: string;
  verified: { method: "account-email"; at: Date } | null;
}): Promise<IdentityRecord> {
  await connectToDatabase();
  try {
    const doc = await Identity.create({
      _id: input._id,
      userId: input.userId,
      type: input.type,
      valueEncrypted: input.valueEncrypted,
      valueBlindIndex: input.valueBlindIndex,
      valueMasked: input.valueMasked,
      verificationStatus: input.verified ? "verified" : "pending",
      verifiedAt: input.verified?.at ?? null,
      verificationMethod: input.verified?.method ?? null,
    });
    return doc.toObject() as IdentityRecord;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new DuplicateIdentityError();
    throw error;
  }
}

/** pending → verified, once. Returns false if it wasn't pending (already verified, removed, or not the user's). */
export async function markIdentityVerified(
  userId: string,
  identityId: Types.ObjectId,
  at: Date,
): Promise<boolean> {
  await connectToDatabase();
  const result = await Identity.updateOne(
    { _id: identityId, userId, status: "active", verificationStatus: "pending" },
    { $set: { verificationStatus: "verified", verifiedAt: at, verificationMethod: "code" } },
  );
  return result.modifiedCount === 1;
}

export async function deleteIdentityForUser(userId: string, identityId: string): Promise<boolean> {
  const _id = objectId(identityId);
  if (!_id) return false;
  await connectToDatabase();
  const deleted = await Identity.findOneAndDelete({ _id, userId, status: "active" });
  if (!deleted) return false;
  // Spec 5.2: exposures live exactly as long as their identity.
  await Promise.all([
    IdentityVerification.deleteMany({ identityId: _id }),
    Exposure.deleteMany({ identityId: _id, userId }),
    RemediationAction.deleteMany({ identityId: _id, userId }),
  ]);
  return true;
}

/* ---------------- Active-identity quota (D-024) ---------------- */

async function countActive(userId: string): Promise<number> {
  return Identity.countDocuments({ userId, status: "active" });
}

/**
 * Atomically claims one active-identity slot. One conditional `$inc` on a
 * single document, so concurrent requests can't overshoot the limit. If the
 * counter has drifted (e.g. a crash between claim and insert), it is
 * recomputed from the real count once and the claim retried.
 */
export async function claimIdentitySlot(userId: string, limit: number): Promise<boolean> {
  await connectToDatabase();
  const attempt = async () => {
    try {
      const doc = await IdentityQuota.findOneAndUpdate(
        { userId, active: mongoose.trusted({ $lt: limit }) },
        { $inc: { active: 1 } },
        { upsert: true, returnDocument: "after" },
      );
      return doc !== null;
    } catch (error) {
      // At the limit: the filter misses and the upsert collides with the existing userId.
      if ((error as { code?: number }).code === 11000) return false;
      throw error;
    }
  };
  if (await attempt()) return true;
  const actual = await countActive(userId);
  const repaired = await IdentityQuota.updateOne(
    { userId, active: mongoose.trusted({ $gt: actual }) },
    { $set: { active: actual } },
  );
  return repaired.modifiedCount === 1 ? attempt() : false;
}

export async function releaseIdentitySlot(userId: string): Promise<void> {
  await connectToDatabase();
  await IdentityQuota.updateOne({ userId, active: mongoose.trusted({ $gt: 0 }) }, { $inc: { active: -1 } });
}

/* ---------------- Ownership verification codes ---------------- */

/** One code per identity; a new code replaces the old one and resets attempts. */
export async function upsertVerificationCode(input: {
  identityId: Types.ObjectId;
  userId: string;
  codeHash: string;
  expiresAt: Date;
}): Promise<void> {
  await connectToDatabase();
  await IdentityVerification.updateOne(
    { identityId: input.identityId },
    {
      $set: {
        userId: input.userId,
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
        attempts: 0,
        consumedAt: null,
      },
    },
    { upsert: true },
  );
}

/**
 * Atomically spends one attempt on a live code. Returns the stored hash to
 * compare against, or null if there's no usable code (missing, expired,
 * consumed, or out of attempts).
 */
export async function spendVerificationAttempt(
  userId: string,
  identityId: Types.ObjectId,
  maxAttempts: number,
  now: Date,
): Promise<{ _id: Types.ObjectId; codeHash: string; attempts: number } | null> {
  await connectToDatabase();
  return IdentityVerification.findOneAndUpdate(
    {
      identityId,
      userId,
      consumedAt: null,
      expiresAt: mongoose.trusted({ $gt: now }),
      attempts: mongoose.trusted({ $lt: maxAttempts }),
    },
    { $inc: { attempts: 1 } },
    { returnDocument: "after", projection: { codeHash: 1, attempts: 1 } },
  ).lean<{ _id: Types.ObjectId; codeHash: string; attempts: number }>();
}

/** Marks a code used; only the first caller wins. */
export async function consumeVerificationCode(verificationId: Types.ObjectId): Promise<boolean> {
  const result = await IdentityVerification.deleteOne({ _id: verificationId, consumedAt: null });
  return result.deletedCount === 1;
}
