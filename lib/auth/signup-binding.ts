import { randomBytes, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";
import { keyedHash } from "@/lib/crypto/keyed-hash";
import { getAuthDb } from "@/lib/db/mongo-client";
import { connectToDatabase } from "@/lib/db/mongoose";
import { parseObjectId } from "@/lib/db/object-id";
import { PendingSignup } from "@/models/PendingSignup";

/** One hour: comfortably longer than a verification code's 10 minutes, so resends keep working. */
const NONCE_TTL_MS = 60 * 60_000;

export interface AuthUserRecord {
  id: string;
  emailVerified: boolean;
}

/** Better Auth's user row, read directly (the in-process API has no "find by email" for us). */
export async function findAuthUserByEmail(email: string): Promise<AuthUserRecord | null> {
  const user = await getAuthDb()
    .collection("user")
    .findOne({ email: email.trim().toLowerCase() }, { projection: { _id: 1, emailVerified: 1 } });
  return user ? { id: String(user._id), emailVerified: Boolean(user.emailVerified) } : null;
}

/** Issues a fresh nonce for this user (replacing any earlier one) and returns the plaintext once. */
export async function issueSignupNonce(userId: string, now = new Date()): Promise<string> {
  await connectToDatabase();
  const nonce = randomBytes(18).toString("base64url");
  await PendingSignup.updateOne(
    { userId },
    {
      $set: {
        nonceHash: keyedHash("signup-nonce", nonce),
        expiresAt: new Date(now.getTime() + NONCE_TTL_MS),
      },
    },
    { upsert: true },
  );
  return nonce;
}

export async function signupNonceMatches(
  userId: string,
  nonce: string | null | undefined,
  now = new Date(),
): Promise<boolean> {
  if (!nonce || nonce.length > 64) return false;
  await connectToDatabase();
  const row = await PendingSignup.findOne({ userId, expiresAt: mongoose.trusted({ $gt: now }) }).lean();
  if (!row) return false;
  const expected = Buffer.from(row.nonceHash, "hex");
  const actual = Buffer.from(keyedHash("signup-nonce", nonce), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function clearSignupNonce(userId: string): Promise<void> {
  await connectToDatabase();
  await PendingSignup.deleteOne({ userId });
}

/** A completed password reset proves mailbox control: the account is verified and pending binds are void. */
export async function markVerifiedByMailboxProof(userId: string): Promise<void> {
  const _id = parseObjectId(userId);
  if (!_id) return;
  await getAuthDb()
    .collection("user")
    .updateOne({ _id }, { $set: { emailVerified: true, updatedAt: new Date() } });
  await clearSignupNonce(userId);
}
