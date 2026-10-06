import type { Db } from "mongodb";

/**
 * Indexes for Better Auth's collections. The adapter also creates the core
 * ones lazily; declaring them here makes `npm run db:indexes` the single,
 * explicit source in production (autoIndex is off there, D-010).
 */
export async function ensureAuthIndexes(db: Db): Promise<string[]> {
  return Promise.all([
    db.collection("user").createIndex({ email: 1 }, { unique: true, name: "email_unique" }),
    db.collection("session").createIndex({ token: 1 }, { unique: true, name: "token_unique" }),
    // Settings → Security lists and revokes a user's sessions.
    db.collection("session").createIndex({ userId: 1, updatedAt: -1 }, { name: "user_sessions" }),
    // Expired sessions disappear on their own (retention: per auth policy, spec 5.2).
    db.collection("session").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "session_ttl" }),
    db.collection("account").createIndex({ userId: 1 }, { name: "account_user" }),
    db.collection("verification").createIndex({ identifier: 1 }, { name: "verification_identifier" }),
    // Codes and reset tokens are purged once expired, even if never looked up again.
    db
      .collection("verification")
      .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "verification_ttl" }),
  ]);
}
