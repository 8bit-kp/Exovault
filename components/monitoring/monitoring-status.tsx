import { Pause, Radar, RadioTower, TriangleAlert, type LucideIcon } from "lucide-react";
import type { MonitoringState } from "@/lib/domain/monitoring";
import { formatDateTime, isoString } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

const STATE_META: Record<MonitoringState, { label: string; detail: string; icon: LucideIcon; tone: string }> =
  {
    // M1 has no scheduler, so "off" is the honest default (spec Part 3).
    off: { label: "Off", detail: "Manual scans only", icon: RadioTower, tone: "text-fg-muted" },
    active: { label: "Active", detail: "Scheduled scans are running", icon: Radar, tone: "text-ok" },
    paused: { label: "Paused", detail: "Scheduled scans are paused", icon: Pause, tone: "text-warn" },
    degraded: {
      label: "Degraded",
      detail: "Recent scheduled scans had errors",
      icon: TriangleAlert,
      tone: "text-warn",
    },
  };

interface MonitoringStatusProps {
  state: MonitoringState;
  lastScanAt: string | null;
  nextScanAt: string | null;
  className?: string;
}

export function MonitoringStatus({ state, lastScanAt, nextScanAt, className }: MonitoringStatusProps) {
  const meta = STATE_META[state];
  const Icon = meta.icon;
  return (
    <div className={cn("space-y-3", className)}>
      <p className="flex items-center gap-2.5">
        <span className="relative grid size-8 place-items-center rounded-md border border-line bg-surface-2">
          <Icon aria-hidden className={cn("size-4", meta.tone, state === "active" && "animate-signal")} />
        </span>
        <span>
          <span className="eyebrow block">Monitoring</span>
          <span className="text-sm font-semibold text-fg">
            {meta.label} <span className="font-normal text-fg-muted">— {meta.detail}</span>
          </span>
        </span>
      </p>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-fg-subtle">Last scan</dt>
          <dd className="font-mono text-xs text-fg">
            {lastScanAt ? (
              <time dateTime={isoString(lastScanAt)}>{formatDateTime(lastScanAt)}</time>
            ) : (
              "Never"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-fg-subtle">Next scan</dt>
          <dd className="font-mono text-xs text-fg">
            {state === "active" && nextScanAt ? (
              <time dateTime={isoString(nextScanAt)}>{formatDateTime(nextScanAt)}</time>
            ) : (
              "Not scheduled"
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
