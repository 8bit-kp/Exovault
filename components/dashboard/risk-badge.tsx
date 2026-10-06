import type { RiskBand } from "@/lib/domain/risk";
import { RISK_BAND_META, SEVERITY_META } from "@/components/exposure/severity-meta";
import { SeverityPips } from "@/components/exposure/severity-badge";
import { cn } from "@/lib/utils/cn";

/** The band of the Exposure Risk Score. Shares severity's visual channels so the two read as one system. */
export function RiskBadge({ band, className }: { band: RiskBand; className?: string }) {
  const { label, tone } = RISK_BAND_META[band];
  const meta = SEVERITY_META[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-sm border bg-surface-2 px-2 py-1 font-mono text-xs font-semibold tracking-wider uppercase",
        meta.border,
        meta.text,
        className,
      )}
      data-band={band}
    >
      <SeverityPips severity={tone} />
      {label}
      <span className="sr-only"> risk</span>
    </span>
  );
}
