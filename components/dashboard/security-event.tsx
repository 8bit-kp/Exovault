import {
  BellRing,
  CircleCheck,
  CircleX,
  Fingerprint,
  Radar,
  ShieldAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { formatDateTime, isoString } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

export const SECURITY_EVENT_KINDS = [
  "scan_completed",
  "scan_partial",
  "scan_failed",
  "exposure_detected",
  "identity_verified",
  "monitoring_changed",
  "notification_sent",
] as const;
export type SecurityEventKind = (typeof SECURITY_EVENT_KINDS)[number];

const KIND_META: Record<SecurityEventKind, { icon: LucideIcon; tone: string; label: string }> = {
  scan_completed: { icon: CircleCheck, tone: "text-ok", label: "Scan completed" },
  scan_partial: { icon: TriangleAlert, tone: "text-warn", label: "Scan partially completed" },
  scan_failed: { icon: CircleX, tone: "text-danger", label: "Scan failed" },
  exposure_detected: { icon: ShieldAlert, tone: "text-sev-high", label: "Exposure detected" },
  identity_verified: { icon: Fingerprint, tone: "text-accent", label: "Identity verified" },
  monitoring_changed: { icon: Radar, tone: "text-fg-muted", label: "Monitoring changed" },
  notification_sent: { icon: BellRing, tone: "text-fg-muted", label: "Notification sent" },
};

interface SecurityEventProps {
  kind: SecurityEventKind;
  at: string;
  /** Safe, user-facing detail. Masked identifiers only. */
  detail: string;
  className?: string;
}

/** One line of recent activity. Rendered inside an <ol>, newest first. */
export function SecurityEvent({ kind, at, detail, className }: SecurityEventProps) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <div className={cn("flex gap-3 py-3", className)}>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", meta.tone)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">{meta.label}</p>
        <p className="text-sm text-fg-muted">{detail}</p>
      </div>
      <time dateTime={isoString(at)} className="shrink-0 font-mono text-xs text-fg-subtle">
        {formatDateTime(at)}
      </time>
    </div>
  );
}
