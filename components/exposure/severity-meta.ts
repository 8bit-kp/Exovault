import { OctagonAlert, TriangleAlert, ChevronsUp, Info, Minus, type LucideIcon } from "lucide-react";
import type { ExposureSeverity } from "@/lib/domain/exposure";
import type { RiskBand } from "@/lib/domain/risk";

/**
 * Severity is encoded on four independent channels (spec 13.9): text label,
 * icon shape, pip count, and colour. Removing any one still leaves it legible.
 */
export interface SeverityMeta {
  label: string;
  /** Filled pips out of 4: the non-colour, non-text channel. */
  pips: 0 | 1 | 2 | 3 | 4;
  icon: LucideIcon;
  /** Utility classes built from tokens; listed literally so Tailwind can see them. */
  text: string;
  fill: string;
  /** SVG fill utility (same hue as `fill`). */
  svgFill: string;
  border: string;
}

export const SEVERITY_META: Record<ExposureSeverity, SeverityMeta> = {
  critical: {
    label: "Critical",
    pips: 4,
    icon: OctagonAlert,
    text: "text-sev-critical",
    fill: "bg-sev-critical",
    svgFill: "fill-sev-critical",
    border: "border-sev-critical/45",
  },
  high: {
    label: "High",
    pips: 3,
    icon: TriangleAlert,
    text: "text-sev-high",
    fill: "bg-sev-high",
    svgFill: "fill-sev-high",
    border: "border-sev-high/40",
  },
  medium: {
    label: "Medium",
    pips: 2,
    icon: ChevronsUp,
    text: "text-sev-medium",
    fill: "bg-sev-medium",
    svgFill: "fill-sev-medium",
    border: "border-sev-medium/35",
  },
  low: {
    label: "Low",
    pips: 1,
    icon: Minus,
    text: "text-sev-low",
    fill: "bg-sev-low",
    svgFill: "fill-sev-low",
    border: "border-sev-low/35",
  },
  info: {
    label: "Info",
    pips: 0,
    icon: Info,
    text: "text-sev-info",
    fill: "bg-sev-info",
    svgFill: "fill-sev-info",
    border: "border-sev-info/30",
  },
};

export interface RiskBandMeta {
  label: string;
  /** Severity whose visual treatment the band borrows. */
  tone: ExposureSeverity;
}

export const RISK_BAND_META: Record<RiskBand, RiskBandMeta> = {
  minimal: { label: "Minimal", tone: "info" },
  low: { label: "Low", tone: "low" },
  moderate: { label: "Moderate", tone: "medium" },
  high: { label: "High", tone: "high" },
  critical: { label: "Critical", tone: "critical" },
};
