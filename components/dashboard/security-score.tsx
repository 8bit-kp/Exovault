import { ArrowDown, ArrowUp, Equal } from "lucide-react";
import { brand } from "@/config/brand";
import { RISK_BAND_META, SEVERITY_META } from "@/components/exposure/severity-meta";
import { normalizeRiskScore, riskBandForScore, RISK_BANDS } from "@/lib/domain/risk";
import { cn } from "@/lib/utils/cn";
import { RiskBadge } from "./risk-badge";

interface SecurityScoreProps {
  /** null = never scanned; the component then shows an honest empty reading. */
  score: number | null;
  /** Score from the previous snapshot, to show direction of change. */
  previousScore?: number | null;
  className?: string;
}

const BAND_RANGES: Record<(typeof RISK_BANDS)[number], [number, number]> = {
  minimal: [0, 20],
  low: [20, 40],
  moderate: [40, 60],
  high: [60, 80],
  critical: [80, 100],
};

/**
 * Exposure Risk Score readout. Always shows the direction ("higher = more
 * risk") and the methodology disclaimer (spec Part 9): a number on its own is
 * ambiguous.
 */
export function SecurityScore({ score, previousScore, className }: SecurityScoreProps) {
  const value = score === null ? null : normalizeRiskScore(score);
  const band = value === null ? null : riskBandForScore(value);
  const previous = previousScore == null ? null : normalizeRiskScore(previousScore);
  const delta = value !== null && previous !== null ? value - previous : null;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="eyebrow">Exposure Risk Score</p>
          <p className="mt-2 flex items-baseline gap-2">
            {value === null ? (
              <span className="font-mono text-5xl font-medium text-fg-subtle">--</span>
            ) : (
              <data value={value} className="font-mono text-6xl font-medium tracking-tight text-fg">
                {value}
              </data>
            )}
            <span className="font-mono text-lg text-fg-subtle">/ 100</span>
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {band ? <RiskBadge band={band} /> : <span className="text-sm text-fg-muted">Not yet scored</span>}
          {delta !== null ? <ScoreDelta delta={delta} /> : null}
        </div>
      </div>

      <ScoreScale value={value} />

      <p className="text-xs text-fg-subtle">
        <span className="text-fg-muted">Higher means more risk.</span> Calculated by {brand.name} from your
        known exposures. It is not an industry-standard security score.
      </p>
    </div>
  );
}

function ScoreDelta({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
        <Equal aria-hidden className="size-3.5" /> No change since last scan
      </span>
    );
  }
  const worse = delta > 0;
  const Icon = worse ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs", worse ? "text-sev-high" : "text-ok")}>
      <Icon aria-hidden className="size-3.5" />
      {worse ? "Up" : "Down"} {Math.abs(delta)} since last scan
      <span className="sr-only">{worse ? " (more risk)" : " (less risk)"}</span>
    </span>
  );
}

/** Banded horizontal scale with a marker. SVG attributes, not inline styles, so it is CSP-safe. */
function ScoreScale({ value }: { value: number | null }) {
  return (
    <div aria-hidden>
      <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-2.5 w-full overflow-visible">
        {RISK_BANDS.map((band) => {
          const [from, to] = BAND_RANGES[band];
          const tone = SEVERITY_META[RISK_BAND_META[band].tone];
          const active = value !== null && riskBandForScore(value) === band;
          return (
            <rect
              key={band}
              x={from + 0.4}
              y={3}
              width={to - from - 0.8}
              height={4}
              className={cn(tone.svgFill, active ? "opacity-100" : "opacity-25")}
            />
          );
        })}
        {value !== null ? (
          <rect x={Math.min(99, Math.max(0, value - 0.5))} y={0} width={1} height={10} className="fill-fg" />
        ) : null}
      </svg>
      <div className="mt-1.5 flex justify-between font-mono text-2xs text-fg-subtle">
        <span>0</span>
        <span>20</span>
        <span>40</span>
        <span>60</span>
        <span>80</span>
        <span>100</span>
      </div>
    </div>
  );
}
