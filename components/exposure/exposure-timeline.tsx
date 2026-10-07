import type { ReactNode } from "react";
import { formatMonthYear, monthKey } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { ExposureCard } from "./exposure-card";
import type { ExposureView } from "./types";

export interface TimelineGroup {
  key: string;
  label: string;
  items: ExposureView[];
}

/** Newest month first, newest item first within a month. Pure, so it is unit-tested. */
export function groupExposuresByMonth(exposures: ExposureView[]): TimelineGroup[] {
  const sorted = [...exposures].sort((a, b) => Date.parse(b.discoveredAt) - Date.parse(a.discoveredAt));
  const groups = new Map<string, TimelineGroup>();
  for (const exposure of sorted) {
    const key = monthKey(exposure.discoveredAt);
    let group = groups.get(key);
    if (!group) {
      group = { key, label: formatMonthYear(exposure.discoveredAt), items: [] };
      groups.set(key, group);
    }
    group.items.push(exposure);
  }
  return [...groups.values()];
}

interface ExposureTimelineProps {
  exposures: ExposureView[];
  /** Builds the detail URL. Omit for non-interactive cards. */
  hrefFor?: (exposure: ExposureView) => string;
  empty: ReactNode;
  className?: string;
}

export function ExposureTimeline({ exposures, hrefFor, empty, className }: ExposureTimelineProps) {
  const groups = groupExposuresByMonth(exposures);
  if (groups.length === 0) return <>{empty}</>;
  return (
    <ol className={cn("space-y-8", className)}>
      {groups.map((group) => (
        <li key={group.key} aria-labelledby={`tl-${group.key}`}>
          <h3 id={`tl-${group.key}`} className="eyebrow sticky top-0 z-10 bg-bg/95 py-2 backdrop-blur-sm">
            {group.label}
          </h3>
          <ol className="relative mt-2 space-y-2 border-l border-line pl-5">
            {group.items.map((exposure) => (
              <li key={exposure.id} className="relative">
                <span
                  aria-hidden
                  className="absolute top-6 -left-[23.5px] size-2 rounded-full border border-line-strong bg-surface-3"
                />
                <ExposureCard exposure={exposure} href={hrefFor?.(exposure)} headingLevel="h4" />
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}
