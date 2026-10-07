import "server-only";
import mongoose, { Types } from "mongoose";
import { z } from "zod";
import type { ExposureView } from "@/components/exposure/types";
import { connectToDatabase } from "@/lib/db/mongoose";
import { EXPOSURE_SEVERITIES, EXPOSURE_SOURCE_TYPES, REMEDIATION_STATES } from "@/lib/domain/exposure";
import { Exposure, type ExposureDoc } from "@/models/Exposure";
import { Identity } from "@/models/Identity";

/**
 * Timeline (spec 13.7): every exposure of the user, newest detection first,
 * filtered server-side and paginated. Filters come from the URL, so they're
 * validated strictly; unknown values are ignored rather than trusted.
 */
export const TIMELINE_PAGE_SIZE = 20;

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const timelineFiltersSchema = z.object({
  severity: z.enum(EXPOSURE_SEVERITIES).optional().catch(undefined),
  status: z.enum(REMEDIATION_STATES).optional().catch(undefined),
  source: z.enum(EXPOSURE_SOURCE_TYPES).optional().catch(undefined),
  identity: z
    .string()
    .regex(/^[0-9a-f]{24}$/)
    .optional()
    .catch(undefined),
  from: month.optional().catch(undefined),
  to: month.optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).catch(1).default(1),
});
export type TimelineFilters = z.infer<typeof timelineFiltersSchema>;

export function parseTimelineFilters(params: Record<string, string | string[] | undefined>): TimelineFilters {
  const flat = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  return timelineFiltersSchema.parse(flat);
}

type Row = ExposureDoc & { _id: Types.ObjectId };

export async function listTimeline(
  userId: string,
  filters: TimelineFilters,
): Promise<{ items: ExposureView[]; total: number; pages: number; page: number }> {
  await connectToDatabase();
  const query: Record<string, unknown> = { userId };
  if (filters.severity) query.severity = filters.severity;
  if (filters.status) query.remediationState = filters.status;
  if (filters.source) query.sourceType = filters.source;
  if (filters.identity) query.identityId = new Types.ObjectId(filters.identity);
  if (filters.from || filters.to) {
    const range: Record<string, Date> = {};
    if (filters.from) range.$gte = new Date(`${filters.from}-01T00:00:00Z`);
    if (filters.to) {
      const [y, m] = filters.to.split("-").map(Number);
      range.$lt = new Date(Date.UTC(y, m, 1)); // first day of the following month
    }
    query.firstSeenAt = mongoose.trusted(range);
  }

  const total = await Exposure.countDocuments(query);
  const pages = Math.max(1, Math.ceil(total / TIMELINE_PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  const [rows, identities] = await Promise.all([
    Exposure.find(query)
      .sort({ firstSeenAt: -1, _id: -1 })
      .skip((page - 1) * TIMELINE_PAGE_SIZE)
      .limit(TIMELINE_PAGE_SIZE)
      .lean<Row[]>(),
    Identity.find({ userId }, { valueMasked: 1 }).lean(),
  ]);
  const masked = new Map(identities.map((i) => [String(i._id), i.valueMasked]));
  return {
    page,
    pages,
    total,
    items: rows.map((row) => ({
      id: String(row._id),
      sourceName: row.isSensitiveSource ? "" : row.sourceName,
      sourceType: row.sourceType,
      severity: row.severity,
      breachDate: row.breachDate ? row.breachDate.toISOString() : null,
      discoveredAt: row.firstSeenAt.toISOString(),
      dataTypes: row.exposedDataTypes,
      detectionState: row.detectionState,
      remediationState: row.remediationState,
      sensitive: row.isSensitiveSource,
      identityMasked: masked.get(String(row.identityId)) ?? "removed identity",
      isDemo: row.isDemo,
      providers: row.providers,
    })),
  };
}
