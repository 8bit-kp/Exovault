import "server-only";
import { recordAuditEvent } from "@/lib/audit";
import {
  deleteOtherSessionsForUser,
  deleteSessionForUser,
  listActiveSessionsForUser,
} from "@/server/repositories/session-repository";
import type { RequestContext } from "./auth-service";

export { type SessionSummary } from "@/server/repositories/session-repository";

export function listSessions(userId: string) {
  return listActiveSessionsForUser(userId);
}

export async function revokeSession(
  userId: string,
  sessionId: string,
  ctx: RequestContext,
): Promise<boolean> {
  const revoked = await deleteSessionForUser(userId, sessionId);
  await recordAuditEvent({
    event: "SESSIONS_REVOKED",
    outcome: revoked ? "success" : "failure",
    userId,
    requestId: ctx.requestId,
    metadata: { scope: "one" },
  });
  return revoked;
}

export async function revokeOtherSessions(
  userId: string,
  currentSessionId: string,
  ctx: RequestContext,
): Promise<number> {
  const count = await deleteOtherSessionsForUser(userId, currentSessionId);
  await recordAuditEvent({
    event: "SESSIONS_REVOKED",
    outcome: "success",
    userId,
    requestId: ctx.requestId,
    metadata: { scope: "others", count },
  });
  return count;
}
