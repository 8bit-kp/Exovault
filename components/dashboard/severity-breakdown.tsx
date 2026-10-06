import { EXPOSURE_SEVERITIES, type ExposureSeverity } from "@/lib/domain/exposure";
import { SEVERITY_META } from "@/components/exposure/severity-meta";
import { SeverityPips } from "@/components/exposure/severity-badge";
import { cn } from "@/lib/utils/cn";

interface SeverityBreakdownProps {
  /** Counts of *active* exposures per severity (spec 7.7 definition). */
  counts: Partial<Record<ExposureSeverity, number>>;
  className?: string;
}

/** Icon + label + count per severity. A zero is shown, dimmed, so absence is explicit. */
export function SeverityBreakdown({ counts, className }: SeverityBreakdownProps) {
  const total = EXPOSURE_SEVERITIES.reduce((sum, severity) => sum + (counts[severity] ?? 0), 0);
  return (
    <div className={cn("space-y-3", className)}>
      <p className="flex items-baseline gap-2">
        <data value={total} className="font-mono text-3xl font-medium text-fg">
          {total}
        </data>
        <span className="text-sm text-fg-muted">active {total === 1 ? "exposure" : "exposures"}</span>
      </p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {EXPOSURE_SEVERITIES.map((severity) => {
          const meta = SEVERITY_META[severity];
          const Icon = meta.icon;
          const count = counts[severity] ?? 0;
          return (
            <div
              key={severity}
              className={cn(
                "flex flex-col gap-2 rounded-md border bg-surface-1 px-3 py-2.5",
                count > 0 ? meta.border : "border-line",
              )}
            >
              <dt
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium",
                  count > 0 ? meta.text : "text-fg-subtle",
                )}
              >
                <Icon aria-hidden className="size-3.5" />
                {meta.label}
              </dt>
              <dd className="flex items-center justify-between">
                <data
                  value={count}
                  className={cn("font-mono text-xl", count > 0 ? "text-fg" : "text-fg-subtle")}
                >
                  {count}
                </data>
                <SeverityPips severity={severity} />
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
