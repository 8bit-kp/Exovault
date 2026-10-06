import type { ExposureSeverity } from "@/lib/domain/exposure";
import { cn } from "@/lib/utils/cn";
import { SEVERITY_META } from "./severity-meta";

/** Four-pip signal glyph: the shape channel for severity. Decorative; the label carries meaning. */
export function SeverityPips({ severity, className }: { severity: ExposureSeverity; className?: string }) {
  const meta = SEVERITY_META[severity];
  return (
    <span aria-hidden className={cn("inline-flex items-end gap-px", className)} data-pips={meta.pips}>
      {[1, 2, 3, 4].map((level) => (
        <span
          key={level}
          className={cn(
            "w-[3px] rounded-[1px]",
            level === 1 ? "h-1.5" : level === 2 ? "h-2" : level === 3 ? "h-2.5" : "h-3",
            level <= meta.pips ? meta.fill : "bg-line-strong",
          )}
        />
      ))}
    </span>
  );
}

interface SeverityBadgeProps {
  severity: ExposureSeverity;
  size?: "sm" | "md";
  /** Hide the word "severity" for screen readers when context already says it. */
  bare?: boolean;
  className?: string;
}

export function SeverityBadge({ severity, size = "md", bare = false, className }: SeverityBadgeProps) {
  const meta = SEVERITY_META[severity];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border bg-surface-2 font-medium",
        meta.border,
        meta.text,
        size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm",
        className,
      )}
      data-severity={severity}
    >
      <Icon aria-hidden className={size === "sm" ? "size-3" : "size-3.5"} />
      <span>
        {meta.label}
        {bare ? null : <span className="sr-only"> severity</span>}
      </span>
      <SeverityPips severity={severity} />
    </span>
  );
}
