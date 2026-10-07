import type { Metadata } from "next";
import Link from "next/link";
import { History } from "lucide-react";
import { SOURCE_TYPE_LABELS } from "@/components/exposure/data-types";
import { REMEDIATION_LABELS } from "@/components/exposure/exposure-labels";
import { ExposureTimeline } from "@/components/exposure/exposure-timeline";
import { SEVERITY_META } from "@/components/exposure/severity-meta";
import { SourceAttribution } from "@/components/exposure/source-attribution";
import { PageHeader } from "@/components/layout/page-header";
import { buttonClasses } from "@/components/ui/button";
import { DemoDataLabel } from "@/components/ui/demo-data-label";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/lib/auth/session";
import { EXPOSURE_SEVERITIES, EXPOSURE_SOURCE_TYPES, REMEDIATION_STATES } from "@/lib/domain/exposure";
import { attributionsFor } from "@/server/services/exposure/exposure-query";
import {
  listTimeline,
  parseTimelineFilters,
  type TimelineFilters,
} from "@/server/services/exposure/timeline-query";
import { listIdentities } from "@/server/services/identity/identity-service";

export const metadata: Metadata = { title: "Timeline" };

const selectClass = "h-10 w-full rounded-md border border-line-strong bg-bg px-2 text-sm text-fg";

/** Spec 13.7: chronological, grouped by month, filterable, paginated. Works without JavaScript (GET form). */
export default async function TimelinePage({ searchParams }: PageProps<"/app/timeline">) {
  const user = await requireUser();
  const filters = parseTimelineFilters(await searchParams);
  const [{ items, total, pages, page }, identities] = await Promise.all([
    listTimeline(user.id, filters),
    listIdentities(user.id),
  ]);
  const href = (next: Partial<TimelineFilters>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filters, ...next }))
      if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
    if (params.get("page") === "1") params.delete("page");
    const query = params.toString();
    return query ? `/app/timeline?${query}` : "/app/timeline";
  };
  const filtered = Boolean(
    filters.severity || filters.status || filters.source || filters.identity || filters.from || filters.to,
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Timeline"
        description="When each exposure was first detected, newest first."
        action={items.some((e) => e.isDemo) ? <DemoDataLabel /> : undefined}
      />

      <form
        method="get"
        action="/app/timeline"
        className="grid gap-3 rounded-lg border border-line bg-surface-1 p-4 sm:grid-cols-3 lg:grid-cols-6"
        aria-label="Filter timeline"
      >
        <label className="space-y-1 text-xs text-fg-muted">
          Severity
          <select name="severity" defaultValue={filters.severity ?? ""} className={selectClass}>
            <option value="">All</option>
            {EXPOSURE_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {SEVERITY_META[s].label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-fg-muted">
          Status
          <select name="status" defaultValue={filters.status ?? ""} className={selectClass}>
            <option value="">All</option>
            {REMEDIATION_STATES.map((s) => (
              <option key={s} value={s}>
                {REMEDIATION_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-fg-muted">
          Source
          <select name="source" defaultValue={filters.source ?? ""} className={selectClass}>
            <option value="">All</option>
            {EXPOSURE_SOURCE_TYPES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_TYPE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-fg-muted">
          Identity
          <select name="identity" defaultValue={filters.identity ?? ""} className={selectClass}>
            <option value="">All</option>
            {identities.map((i) => (
              <option key={i.id} value={i.id}>
                {i.masked}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-fg-muted">
          From
          <input type="month" name="from" defaultValue={filters.from ?? ""} className={selectClass} />
        </label>
        <label className="space-y-1 text-xs text-fg-muted">
          To
          <input type="month" name="to" defaultValue={filters.to ?? ""} className={selectClass} />
        </label>
        <div className="flex gap-2 sm:col-span-3 lg:col-span-6">
          <button type="submit" className={buttonClasses({ size: "sm" })}>
            Apply filters
          </button>
          {filtered ? (
            <Link href="/app/timeline" className={buttonClasses({ size: "sm", variant: "ghost" })}>
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <p className="text-sm text-fg-muted" aria-live="polite">
        {total} exposure{total === 1 ? "" : "s"}
        {filtered ? " match these filters" : ""}.
      </p>

      <ExposureTimeline
        exposures={items}
        hrefFor={(e) => `/app/exposures/${e.id}`}
        empty={
          <EmptyState
            icon={History}
            title={filtered ? "Nothing matches these filters" : "No history yet"}
            description={
              filtered ? "Try fewer filters." : "Exposures appear here after your first scan finds something."
            }
          />
        }
      />

      {pages > 1 ? (
        <nav aria-label="Timeline pages" className="flex items-center justify-between gap-4">
          {page > 1 ? (
            <Link
              href={href({ page: page - 1 })}
              className={buttonClasses({ size: "sm", variant: "secondary" })}
            >
              Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-fg-muted">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link
              href={href({ page: page + 1 })}
              className={buttonClasses({ size: "sm", variant: "secondary" })}
            >
              Older
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}

      <SourceAttribution attributions={attributionsFor(items.flatMap((e) => e.providers))} />
    </div>
  );
}
