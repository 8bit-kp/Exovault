import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface ScoreFactorView {
  key: string;
  label: string;
  points: number;
  detail: string;
}

/**
 * "Why this score?" (spec Part 9). Native <details>: keyboard and screen
 * reader support without script. Factors come straight from the scorer.
 */
export function ScoreExplainer({
  factors,
  methodologyVersion,
}: {
  factors: ScoreFactorView[];
  methodologyVersion: string;
}) {
  return (
    <details className="group rounded-md border border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-fg marker:hidden">
        Why this score?
        <ChevronDown
          aria-hidden
          className="size-4 text-fg-subtle transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="space-y-3 border-t border-line px-4 py-3">
        <ul className="space-y-3">
          {factors.map((factor) => (
            <li key={factor.key} className="flex gap-3">
              <span
                className={cn(
                  "w-12 shrink-0 text-right font-mono text-sm",
                  factor.points > 0 ? "text-sev-high" : factor.points < 0 ? "text-ok" : "text-fg-subtle",
                )}
              >
                {factor.points > 0
                  ? `+${factor.points}`
                  : factor.points < 0
                    ? `−${Math.abs(factor.points)}`
                    : "·"}
                <span className="sr-only"> points</span>
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-fg">{factor.label}</span>
                <span className="block text-xs text-fg-muted">{factor.detail}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-fg-subtle">
          Points are approximate shares of the score. Method{" "}
          <span className="font-mono">{methodologyVersion}</span>: severity weighted by recency and your
          remediation progress, with diminishing returns for each additional exposure.
        </p>
      </div>
    </details>
  );
}
