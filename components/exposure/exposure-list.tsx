import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { ExposureCard } from "./exposure-card";
import type { ExposureView } from "./types";

interface ExposureListProps {
  exposures: ExposureView[];
  /** Builds the detail URL. IDs only: identifiers never appear in our URLs (spec 5.1). */
  /** Builds the detail URL. Omit for non-interactive cards. */
  hrefFor?: (exposure: ExposureView) => string;
  /** Rendered when the list is empty; callers supply context-specific copy. */
  empty: ReactNode;
  /** Accessible name of the list. */
  label: string;
  className?: string;
}

/** Compact rows, not giant cards. Grouping, filters and pagination wrap this in later phases. */
export function ExposureList({ exposures, hrefFor, empty, label, className }: ExposureListProps) {
  if (exposures.length === 0) return <>{empty}</>;
  return (
    <ul aria-label={label} className={cn("space-y-2", className)}>
      {exposures.map((exposure) => (
        <li key={exposure.id}>
          <ExposureCard exposure={exposure} href={hrefFor?.(exposure)} />
        </li>
      ))}
    </ul>
  );
}
