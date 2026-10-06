import { Types } from "mongoose";
import { connectToDatabase } from "@/lib/db/mongoose";
import type { DetectionState } from "@/lib/domain/exposure";
import { SEVERITY_METHODOLOGY_VERSION } from "@/lib/domain/severity";
import { Breach } from "@/models/Breach";
import { Exposure, type ExposureDoc } from "@/models/Exposure";
import { isSameIncident, mergeExposures } from "./dedupe";
import type { ProviderRunResult } from "./engine";
import { createExposureFingerprint } from "./fingerprint";
import type { NormalizedExposure } from "./types";

/**
 * Match → merge → persist → diff (spec 7.1, 7.5, 7.7). No transactions
 * (D-004): every write is a single-document operation, inserts are
 * idempotent upserts on the unique (identityId, fingerprint) index, so a
 * re-run or a concurrent run can't create duplicates.
 */

export interface ExposureDiff {
  new: string[];
  changed: string[];
  existing: string[];
  noLongerReported: string[];
}

export interface PersistInput {
  userId: string;
  identityId: string;
  exposures: NormalizedExposure[];
  providerResults: ProviderRunResult[];
  now?: Date;
}

type StoredExposure = ExposureDoc & { _id: Types.ObjectId };

const MAX_EXPOSURES_PER_IDENTITY = 5_000;

function storedToNormalized(doc: StoredExposure): NormalizedExposure {
  return {
    providers: doc.providers,
    providerReferences: doc.providerReferences.map((r) => ({ provider: r.provider, reference: r.reference })),
    sourceName: doc.sourceName,
    sourceKey: doc.sourceKey,
    sourceType: doc.sourceType,
    breachDate: doc.breachDate ?? null,
    addedToProviderAt: doc.addedToProviderAt ?? null,
    exposedDataTypes: doc.exposedDataTypes,
    isSensitiveSource: doc.isSensitiveSource,
    confidence: doc.confidence,
    evidenceReferences: doc.evidenceReferences,
    severity: doc.severity,
    severityReason: doc.severityReason,
    discoveredAt: doc.firstSeenAt,
  };
}

async function upsertCatalogEntry(exposure: NormalizedExposure, isDemo: boolean): Promise<Types.ObjectId> {
  const day = exposure.breachDate ? exposure.breachDate.toISOString().slice(0, 10) : "unknown";
  const catalogKey = `${exposure.sourceKey}:${day}`;
  const update = {
    $setOnInsert: {
      catalogKey,
      sourceKey: exposure.sourceKey,
      displayName: exposure.sourceName,
      sourceType: exposure.sourceType,
      breachDate: exposure.breachDate,
      isDemo,
    },
    $addToSet: {
      dataTypes: { $each: exposure.exposedDataTypes },
      providerRefs: { $each: exposure.providerReferences },
      evidenceReferences: { $each: exposure.evidenceReferences },
    },
    ...(exposure.isSensitiveSource ? { $set: { isSensitive: true } } : {}),
  };
  for (let attempt = 0; ; attempt++) {
    try {
      const doc = await Breach.findOneAndUpdate({ catalogKey }, update, {
        upsert: true,
        returnDocument: "after",
        projection: { _id: 1 },
      });
      return doc!._id as Types.ObjectId;
    } catch (error) {
      // Two scans creating the same catalog row at once: the loser retries as an update.
      if ((error as { code?: number }).code !== 11000 || attempt > 0) throw error;
    }
  }
}

function fieldsFrom(exposure: NormalizedExposure) {
  return {
    sourceName: exposure.sourceName,
    sourceType: exposure.sourceType,
    breachDate: exposure.breachDate,
    addedToProviderAt: exposure.addedToProviderAt,
    exposedDataTypes: exposure.exposedDataTypes,
    isSensitiveSource: exposure.isSensitiveSource,
    confidence: exposure.confidence,
    providers: exposure.providers,
    providerReferences: exposure.providerReferences,
    evidenceReferences: exposure.evidenceReferences,
    severity: exposure.severity,
    severityReason: exposure.severityReason,
    severityMethodologyVersion: SEVERITY_METHODOLOGY_VERSION,
  };
}

export async function persistExposures(input: PersistInput): Promise<ExposureDiff> {
  await connectToDatabase();
  const now = input.now ?? new Date();
  const identityId = new Types.ObjectId(input.identityId);
  const diff: ExposureDiff = { new: [], changed: [], existing: [], noLongerReported: [] };
  const demoProviders = new Set(input.providerResults.filter((r) => r.isDemo).map((r) => r.provider));
  const isDemo = (e: NormalizedExposure) => e.providers.every((p) => demoProviders.has(p));

  const stored = await Exposure.find({ identityId, userId: input.userId })
    .limit(MAX_EXPOSURES_PER_IDENTITY)
    .lean<StoredExposure[]>();
  const matchedIds = new Set<string>();

  for (const incoming of input.exposures) {
    const match = stored.find(
      (s) =>
        !matchedIds.has(String(s._id)) &&
        isSameIncident({ sourceKey: s.sourceKey, breachDate: s.breachDate ?? null }, incoming),
    );

    if (match) {
      matchedIds.add(String(match._id));
      const merged = mergeExposures(storedToNormalized(match), incoming);
      const grew = merged.exposedDataTypes.some((t) => !match.exposedDataTypes.includes(t));
      const detectionState: DetectionState = grew ? "changed" : "existing";
      const breachId = await upsertCatalogEntry(merged, isDemo(merged) && match.isDemo);
      await Exposure.updateOne(
        { _id: match._id, userId: input.userId },
        {
          $set: {
            ...fieldsFrom(merged),
            breachId,
            lastSeenAt: now,
            detectionState,
            ...(detectionState !== match.detectionState ? { detectionStateChangedAt: now } : {}),
            isDemo: isDemo(merged) && match.isDemo,
          },
        },
      );
      diff[grew ? "changed" : "existing"].push(String(match._id));
      continue;
    }

    const fingerprint = createExposureFingerprint({
      identityId: input.identityId,
      sourceKey: incoming.sourceKey,
      breachDate: incoming.breachDate,
    });
    const breachId = await upsertCatalogEntry(incoming, isDemo(incoming));
    const result = await Exposure.updateOne(
      { identityId, fingerprint },
      {
        $setOnInsert: {
          userId: input.userId,
          identityId,
          fingerprint,
          sourceKey: incoming.sourceKey,
          breachId,
          ...fieldsFrom(incoming),
          detectionState: "new",
          detectionStateChangedAt: now,
          remediationState: "open",
          firstSeenAt: now,
          lastSeenAt: now,
          isDemo: isDemo(incoming),
        },
      },
      { upsert: true },
    );
    if (result.upsertedId) {
      diff.new.push(String(result.upsertedId));
    } else {
      // A concurrent run inserted it first: same incident, not new for this run.
      const existing = await Exposure.findOne({ identityId, fingerprint }, { _id: 1 }).lean();
      if (existing) {
        matchedIds.add(String(existing._id));
        diff.existing.push(String(existing._id));
      }
    }
  }

  // Spec 7.7: only "no longer reported" when every provider that reported it
  // answered successfully this time and none returned it. A failed provider proves nothing.
  const okProviders = new Set(input.providerResults.filter((r) => r.state === "ok").map((r) => r.provider));
  for (const s of stored) {
    if (matchedIds.has(String(s._id)) || s.detectionState === "no_longer_reported") continue;
    if (okProviders.size > 0 && s.providers.every((p) => okProviders.has(p))) {
      await Exposure.updateOne(
        { _id: s._id, userId: input.userId },
        { $set: { detectionState: "no_longer_reported", detectionStateChangedAt: now } },
      );
      diff.noLongerReported.push(String(s._id));
    }
  }
  return diff;
}
