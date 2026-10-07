import Link from "next/link";
import { ChevronRight, EyeOff } from "lucide-react";
import { formatDate, isoString } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { Tag } from "@/components/ui/tag";
import { SeverityBadge } from "./severity-badge";
import { DATA_TYPE_LABELS, SOURCE_TYPE_LABELS } from "./data-types";
import { DETECTION_LABELS, REMEDIATION_LABELS, SENSITIVE_SOURCE_PLACEHOLDER } from "./exposure-labels";
import { SEVERITY_META } from "./severity-meta";
import type { ExposureView } from "./types";

const MAX_TAGS = 4;

interface ExposureCardProps {
  exposure: ExposureView;
  /** Detail page. Omit to render a non-interactive card. */
  href?: string;
  /** Heading level inside the surrounding list/section. */
  headingLevel?: "h2" | "h3" | "h4";
  className?: string;
}

/**
 * One exposure as a compact, fully clickable row. Order follows progressive
 * disclosure: severity → source → what was exposed → when → status.
 */
export function ExposureCard({ exposure, href, headingLevel: Heading = "h3", className }: ExposureCardProps) {
  const sourceLabel = exposure.sensitive ? SENSITIVE_SOURCE_PLACEHOLDER : exposure.sourceName;
  const extraTypes = exposure.dataTypes.length - MAX_TAGS;

  return (
    <article
      className={cn(
        "group relative flex gap-4 rounded-md border border-line bg-surface-1 px-4 py-4 transition-colors duration-(--duration-fast)",
        href && "hover:border-line-strong hover:bg-surface-2 focus-within:border-line-strong",
        className,
      )}
      data-severity={exposure.severity}
    >
      <span
        aria-hidden
        className={cn("w-0.5 shrink-0 self-stretch rounded-full", SEVERITY_META[exposure.severity].fill)}
      />
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <SeverityBadge severity={exposure.severity} size="sm" />
          {exposure.detectionState === "new" ? (
            <span className="font-mono text-2xs font-semibold tracking-wider text-accent uppercase">New</span>
          ) : null}
          <span className="text-xs text-fg-subtle">{SOURCE_TYPE_LABELS[exposure.sourceType]}</span>
        </div>

        <Heading className="flex items-center gap-2 text-base font-semibold text-fg">
          {exposure.sensitive ? <EyeOff aria-hidden className="size-4 text-fg-subtle" /> : null}
          {href ? (
            // The stretched link makes the whole card the hit target with one accessible name.
            <Link
              href={href}
              className="truncate after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus"
            >
              {sourceLabel}
            </Link>
          ) : (
            <span className="truncate">{sourceLabel}</span>
          )}
        </Heading>

        <ul className="flex flex-wrap gap-1.5" aria-label="Exposed data">
          {exposure.dataTypes.slice(0, MAX_TAGS).map((type) => (
            <li key={type}>
              <Tag>{DATA_TYPE_LABELS[type]}</Tag>
            </li>
          ))}
          {extraTypes > 0 ? (
            <li>
              <Tag>+{extraTypes} more</Tag>
            </li>
          ) : null}
        </ul>

        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-muted">
          <div className="flex gap-1.5">
            <dt className="text-fg-subtle">Detected</dt>
            <dd>
              <time dateTime={isoString(exposure.discoveredAt)}>{formatDate(exposure.discoveredAt)}</time>
            </dd>
          </div>
          {exposure.breachDate ? (
            <div className="flex gap-1.5">
              <dt className="text-fg-subtle">Incident</dt>
              <dd>
                <time dateTime={isoString(exposure.breachDate)}>{formatDate(exposure.breachDate)}</time>
              </dd>
            </div>
          ) : null}
          <div className="flex gap-1.5">
            <dt className="text-fg-subtle">Status</dt>
            <dd>{REMEDIATION_LABELS[exposure.remediationState]}</dd>
          </div>
          {exposure.detectionState === "changed" || exposure.detectionState === "no_longer_reported" ? (
            <div className="flex gap-1.5">
              <dt className="text-fg-subtle">Source</dt>
              <dd>{DETECTION_LABELS[exposure.detectionState]}</dd>
            </div>
          ) : null}
        </dl>
      </div>
      {href ? (
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 self-center text-fg-subtle transition-transform duration-(--duration-fast) group-hover:translate-x-0.5 group-hover:text-fg"
        />
      ) : null}
    </article>
  );
}
