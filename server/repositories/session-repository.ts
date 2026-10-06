import "server-only";
import { ObjectId } from "mongodb";
import { getAuthDb } from "@/lib/db/mongo-client";

/**
 * Better Auth's `session` collection, read and pruned directly so tokens never
 * leave the server. Every query is scoped by `userId` (spec 12.1): a session
 * that belongs to someone else behaves exactly like one that doesn't exist.
 */
export interface SessionSummary {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  userAgent: string | null;
}

function toObjectId(id: string): ObjectId | null {
  return ObjectId.isValid(id) && new ObjectId(id).toHexString() === id ? new ObjectId(id) : null;
}

function sessions() {
  return getAuthDb().collection("session");
}

export async function listActiveSessionsForUser(userId: string, now = new Date()): Promise<SessionSummary[]> {
  const uid = toObjectId(userId);
  if (!uid) return [];
  const rows = await sessions()
    .find(
      { userId: uid, expiresAt: { $gt: now } },
      { projection: { token: 0 }, sort: { updatedAt: -1 }, limit: 50 },
    )
    .toArray();
  return rows.map((row) => ({
    id: String(row._id),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt,
    userAgent: typeof row.userAgent === "string" && row.userAgent ? row.userAgent : null,
  }));
}

/** Returns false when the session doesn't exist or isn't the user's. */
export async function deleteSessionForUser(userId: string, sessionId: string): Promise<boolean> {
  const uid = toObjectId(userId);
  const sid = toObjectId(sessionId);
  if (!uid || !sid) return false;
  const result = await sessions().deleteOne({ _id: sid, userId: uid });
  return result.deletedCount === 1;
}

export async function deleteOtherSessionsForUser(userId: string, keepSessionId: string): Promise<number> {
  const uid = toObjectId(userId);
  const keep = toObjectId(keepSessionId);
  if (!uid || !keep) return 0;
  const result = await sessions().deleteMany({ userId: uid, _id: { $ne: keep } });
  return result.deletedCount;
}
