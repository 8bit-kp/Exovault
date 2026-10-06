import { ArrowRight } from "lucide-react";
import type { ExposureSeverity } from "@/lib/domain/exposure";
import { cn } from "@/lib/utils/cn";
import { ButtonLink } from "@/components/ui/button";
import { SeverityBadge } from "./severity-badge";

interface RecommendationCardProps {
  title: string;
  /** One sentence on why, in plain language. */
  reason: string;
  /** The severity of the exposure(s) driving this recommendation. */
  priority: ExposureSeverity;
  action: { label: string; href: string };
  className?: string;
}

export function RecommendationCard({ title, reason, priority, action, className }: RecommendationCardProps) {
  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-md border border-line bg-surface-1 p-4 sm:flex-row sm:items-center",
        className,
      )}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="sr-only">Priority:</span>
          <SeverityBadge severity={priority} size="sm" bare />
        </div>
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        <p className="text-sm text-fg-muted">{reason}</p>
      </div>
      <ButtonLink href={action.href} variant="secondary" size="sm" className="self-start sm:self-center">
        {action.label}
        <ArrowRight aria-hidden />
      </ButtonLink>
    </article>
  );
}
