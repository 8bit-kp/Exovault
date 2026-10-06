import { CircleCheck, Clock, Mail, Phone, AtSign, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { IdentifierType } from "@/lib/domain/exposure";
import type { MonitoringState } from "@/lib/domain/monitoring";
import { formatDateTime, isoString } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

const TYPE_META: Record<IdentifierType, { label: string; icon: LucideIcon }> = {
  email: { label: "Email address", icon: Mail },
  phone: { label: "Phone number", icon: Phone },
  username: { label: "Username", icon: AtSign },
};

const MONITORING_SHORT_LABELS: Record<MonitoringState, string> = {
  off: "Off (manual)",
  active: "Active",
  paused: "Paused",
  degraded: "Degraded",
};

export interface IdentityView {
  id: string;
  type: IdentifierType;
  /** Precomputed masked value (spec 5.1). The card never receives plaintext. */
  masked: string;
  verification: "pending" | "verified";
  monitoring: MonitoringState;
  lastScanAt: string | null;
  activeExposures: number;
}

interface IdentityCardProps {
  identity: IdentityView;
  /** Primary action for the current state: resend verification, scan now, view results. */
  action?: ReactNode;
  className?: string;
}

export function IdentityCard({ identity, action, className }: IdentityCardProps) {
  const { icon: Icon, label } = TYPE_META[identity.type];
  const verified = identity.verification === "verified";
  return (
    <article className={cn("rounded-lg border border-line bg-surface-1", className)}>
      <div className="flex items-start gap-3 px-5 py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-surface-2">
          <Icon aria-hidden className="size-4 text-fg-muted" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{label}</p>
          <h3 className="truncate font-mono text-base text-fg">{identity.masked}</h3>
        </div>
        {verified ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-ok">
            <CircleCheck aria-hidden className="size-3.5" /> Verified
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-warn">
            <Clock aria-hidden className="size-3.5" /> Awaiting verification
          </span>
        )}
      </div>

      {verified ? (
        <dl className="grid grid-cols-3 gap-3 border-t border-line px-5 py-3 text-xs">
          <div>
            <dt className="text-fg-subtle">Active exposures</dt>
            <dd className="font-mono text-sm text-fg">{identity.activeExposures}</dd>
          </div>
          <div>
            <dt className="text-fg-subtle">Last scan</dt>
            <dd className="font-mono text-fg">
              {identity.lastScanAt ? (
                <time dateTime={isoString(identity.lastScanAt)}>{formatDateTime(identity.lastScanAt)}</time>
              ) : (
                "Never"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-fg-subtle">Monitoring</dt>
            <dd className="text-fg">{MONITORING_SHORT_LABELS[identity.monitoring]}</dd>
          </div>
        </dl>
      ) : (
        <p className="border-t border-line px-5 py-3 text-sm text-fg-muted">
          We emailed a 6-digit code to this address. Enter it to prove you control it. We can&apos;t check an
          identity until it&apos;s verified. Codes expire after 15 minutes; you can request a new one.
        </p>
      )}

      {action ? <div className="flex flex-wrap gap-2 border-t border-line px-5 py-3">{action}</div> : null}
    </article>
  );
}
