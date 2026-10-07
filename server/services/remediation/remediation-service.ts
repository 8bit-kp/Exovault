import "server-only";
import mongoose, { Types } from "mongoose";
import { recordAuditEvent } from "@/lib/audit";
import { connectToDatabase } from "@/lib/db/mongoose";
import { EXPOSED_DATA_TYPES, type ExposedDataType, type RemediationState } from "@/lib/domain/exposure";
import {
  canTransitionRemediation,
  DISMISS_REASONS,
  getRemediationChecklist,
  NOTABLE_CATEGORIES,
  stateFromChecklist,
  type ChecklistKey,
  type DismissReason,
} from "@/lib/domain/remediation";
import { Exposure, type ExposureDoc } from "@/models/Exposure";
import { Identity } from "@/models/Identity";
import { RemediationAction } from "@/models/RemediationAction";
import { getExposureProviders } from "@/server/providers/exposure/registry";
import { attributionsFor } from "@/server/services/exposure/exposure-query";
import { recomputeRiskScore } from "@/server/services/risk/risk-service";
import { RATE_LIMITS } from "@/config/rate-limits";
import { limit } from "@/lib/rate-limit";

/**
 * Exposure detail and remediation (spec 13.6, 7.7). Every read and write is
 * scoped by `userId`; another user's exposure is "not found". Each change
 * stores a new risk-score snapshot and an audit event (IDs only).
 */

type Row = ExposureDoc & { _id: Types.ObjectId };

export interface Ctx {
  requestId: string | null;
}

function objectId(id: string): Types.ObjectId | null {
  return Types.ObjectId.isValid(id) && new Types.ObjectId(id).toHexString() === id
    ? new Types.ObjectId(id)
    : null;
}

async function findOwned(userId: string, exposureId: string): Promise<Row | null> {
  const _id = objectId(exposureId);
  if (!_id) return null;
  await connectToDatabase();
  return Exposure.findOne({ _id, userId }).lean<Row>();
}

export interface ExposureDetailView {
  id: string;
  /** Null while hidden (sensitive source); revealed on request only. */
  sourceName: string | null;
  sensitive: boolean;
  sourceType: Row["sourceType"];
  severity: Row["severity"];
  severityReason: string;
  confidence: number;
  breachDate: string | null;
  addedToProviderAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  detectionState: Row["detectionState"];
  remediationState: RemediationState;
  dismissReason: DismissReason | null;
  exposed: ExposedDataType[];
  notDetected: ExposedDataType[];
  providers: Array<{ name: string; displayName: string }>;
  evidenceReferences: string[];
  attributions: Array<{ name: string; url: string }>;
  identityMasked: string;
  isDemo: boolean;
  checklist: Array<{ key: ChecklistKey; label: string; description: string; done: boolean }>;
}

export async function getExposureDetail(
  userId: string,
  exposureId: string,
): Promise<ExposureDetailView | null> {
  const row = await findOwned(userId, exposureId);
  if (!row) return null;
  const [done, identity] = await Promise.all([
    RemediationAction.find({ exposureId: row._id, userId }, { actionKey: 1 }).lean(),
    Identity.findOne({ _id: row.identityId, userId }, { valueMasked: 1 }).lean(),
  ]);
  const doneKeys = new Set(done.map((d) => d.actionKey));
  const providers = getExposureProviders();
  const displayName = (name: string) =>
    providers.find((p) => p.getName() === name)?.getCapabilities().displayName ?? name;
  return {
    id: String(row._id),
    sourceName: row.isSensitiveSource ? null : row.sourceName,
    sensitive: row.isSensitiveSource,
    sourceType: row.sourceType,
    severity: row.severity,
    severityReason: row.severityReason,
    confidence: row.confidence,
    breachDate: row.breachDate ? row.breachDate.toISOString() : null,
    addedToProviderAt: row.addedToProviderAt ? row.addedToProviderAt.toISOString() : null,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    detectionState: row.detectionState,
    remediationState: row.remediationState,
    dismissReason: (row.dismissReason as DismissReason | null) ?? null,
    exposed: [...row.exposedDataTypes].sort(
      (a, b) => EXPOSED_DATA_TYPES.indexOf(a) - EXPOSED_DATA_TYPES.indexOf(b),
    ),
    notDetected: NOTABLE_CATEGORIES.filter((c) => !row.exposedDataTypes.includes(c)),
    providers: row.providers.map((name) => ({ name, displayName: displayName(name) })),
    // Evidence URLs embed the breach name: withheld for sensitive sources (spec 2.3).
    evidenceReferences: row.isSensitiveSource ? [] : row.evidenceReferences,
    attributions: attributionsFor(row.providers),
    identityMasked: identity?.valueMasked ?? "removed identity",
    isDemo: row.isDemo,
    checklist: getRemediationChecklist({ dataTypes: row.exposedDataTypes, sourceType: row.sourceType }).map(
      (item) => ({ ...item, done: doneKeys.has(item.key) }),
    ),
  };
}

export type RemediationResult =
  | { ok: true; remediationState: RemediationState }
  | {
      ok: false;
      reason: "not_found" | "invalid_item" | "invalid_transition" | "reason_required" | "conflict";
    };

/** Compare-and-set on the current state, so concurrent changes can't skip a transition. */
async function moveState(
  row: Row,
  to: RemediationState,
  extra: { dismissReason?: DismissReason | null } = {},
): Promise<boolean> {
  if (row.remediationState === to) return true;
  const result = await Exposure.updateOne(
    { _id: row._id, userId: row.userId, remediationState: row.remediationState },
    {
      $set: {
        remediationState: to,
        remediationStateChangedAt: new Date(),
        ...("dismissReason" in extra ? { dismissReason: extra.dismissReason } : {}),
      },
    },
  );
  return result.modifiedCount === 1;
}

async function afterChange(row: Row, ctx: Ctx, metadata: Record<string, string | number | boolean>) {
  await recomputeRiskScore(row.userId, "remediation");
  await recordAuditEvent({
    event: "REMEDIATION_UPDATED",
    outcome: "success",
    userId: row.userId,
    requestId: ctx.requestId,
    metadata: { exposureId: String(row._id), ...metadata },
  });
}

/** Tick or untick one checklist item; the exposure's state follows the checklist (D-031). */
export async function setChecklistItem(
  userId: string,
  exposureId: string,
  key: string,
  done: boolean,
  ctx: Ctx,
): Promise<RemediationResult> {
  let row = await findOwned(userId, exposureId);
  if (!row) return { ok: false, reason: "not_found" };
  const items = getRemediationChecklist({ dataTypes: row.exposedDataTypes, sourceType: row.sourceType });
  if (!items.some((i) => i.key === key)) return { ok: false, reason: "invalid_item" };
  const actionKey = key as ChecklistKey;

  if (done) {
    await RemediationAction.updateOne(
      { exposureId: row._id, actionKey },
      { $setOnInsert: { userId, identityId: row.identityId, completedAt: new Date() } },
      { upsert: true },
    );
  } else {
    await RemediationAction.deleteOne({ exposureId: row._id, actionKey, userId });
  }

  // Re-derive and apply the state; retry once if a concurrent change won the compare-and-set.
  for (let attempt = 0; attempt < 2; attempt++) {
    const count = await RemediationAction.countDocuments({
      exposureId: row._id,
      userId,
      actionKey: mongoose.trusted({ $in: items.map((i) => i.key) }),
    });
    const next = stateFromChecklist(row.remediationState, count, items.length);
    if (await moveState(row, next)) {
      await afterChange(row, ctx, { item: actionKey, done, state: next });
      return { ok: true, remediationState: next };
    }
    row = await findOwned(userId, exposureId);
    if (!row) return { ok: false, reason: "not_found" };
  }
  return { ok: false, reason: "conflict" };
}

/** Explicit status change: mark fixed, dismiss (reason required), or reopen. */
export async function setRemediationState(
  userId: string,
  exposureId: string,
  to: RemediationState,
  ctx: Ctx,
  reason?: string | null,
): Promise<RemediationResult> {
  const row = await findOwned(userId, exposureId);
  if (!row) return { ok: false, reason: "not_found" };
  if (!canTransitionRemediation(row.remediationState, to)) return { ok: false, reason: "invalid_transition" };

  let dismissReason: DismissReason | null = null;
  if (to === "dismissed") {
    if (!DISMISS_REASONS.includes(reason as DismissReason)) return { ok: false, reason: "reason_required" };
    dismissReason = reason as DismissReason;
  }
  if (!(await moveState(row, to, { dismissReason: to === "dismissed" ? dismissReason : null }))) {
    return { ok: false, reason: "conflict" };
  }
  await afterChange(row, ctx, {
    from: row.remediationState,
    state: to,
    ...(dismissReason ? { dismissReason } : {}),
  });
  return { ok: true, remediationState: to };
}

/** Sensitive sources are hidden by default (spec 2.3); revealing is explicit and audited. */
export async function revealSensitiveSource(
  userId: string,
  exposureId: string,
  ctx: Ctx,
): Promise<{ ok: true; sourceName: string } | { ok: false; reason: "not_found" }> {
  const row = await findOwned(userId, exposureId);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.isSensitiveSource) {
    const budget = await limit(RATE_LIMITS.revealPerUser, userId).catch(() => null);
    if (!budget?.allowed) return { ok: false, reason: "not_found" };
    await recordAuditEvent({
      event: "SENSITIVE_SOURCE_REVEALED",
      outcome: "success",
      userId,
      requestId: ctx.requestId,
      metadata: { exposureId: String(row._id) },
    });
  }
  return { ok: true, sourceName: row.sourceName };
}
