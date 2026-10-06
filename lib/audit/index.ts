import { keyedHash } from "@/lib/crypto/keyed-hash";
import { connectToDatabase } from "@/lib/db/mongoose";
import type { AuditEvent, AuditOutcome } from "@/lib/domain/audit";
import { logger } from "@/lib/logging/logger";
import { AuditLog } from "@/models/AuditLog";

type MetadataValue = string | number | boolean | null;

export interface AuditInput {
  event: AuditEvent;
  outcome: AuditOutcome;
  userId?: string | null;
  /** Raw subject identifier (e.g. sign-in email). Hashed here; never stored. */
  subject?: string | null;
  /** Raw client IP. Hashed here; never stored. */
  ip?: string | null;
  requestId?: string | null;
  metadata?: Record<string, MetadataValue>;
}

/**
 * Append one audit event. Best-effort by design (D-022): an audit write failure
 * is logged loudly but doesn't turn a successful sign-in into an error.
 */
export async function recordAuditEvent(input: AuditInput): Promise<void> {
  try {
    await connectToDatabase();
    await AuditLog.create({
      event: input.event,
      outcome: input.outcome,
      userId: input.userId ?? null,
      subjectHash: input.subject ? keyedHash("audit-subject", input.subject.trim().toLowerCase()) : null,
      ipHash: input.ip && input.ip !== "unknown" ? keyedHash("audit-ip", input.ip) : null,
      requestId: input.requestId ?? null,
      metadata: input.metadata,
    });
  } catch (error) {
    logger.error(
      {
        err: error instanceof Error ? error.name : "unknown",
        event: input.event,
        requestId: input.requestId,
      },
      "audit write failed",
    );
  }
}
