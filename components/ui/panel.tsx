import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

/** The one elevated surface. Sharp-ish corners, hairline border, no glow. */
export function Panel({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-lg border border-line bg-surface-1 shadow-raised", className)}
      {...props}
    />
  );
}

interface PanelHeaderProps {
  title: ReactNode;
  /** Small mono label above the title, e.g. "01 / Status". */
  eyebrow?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Heading level; panels sit under a page h1 so h2 is the default. */
  as?: "h2" | "h3";
  id?: string;
  className?: string;
}

export function PanelHeader({
  title,
  eyebrow,
  description,
  action,
  as: Heading = "h2",
  id,
  className,
}: PanelHeaderProps) {
  return (
    <header
      className={cn("flex items-start justify-between gap-4 border-b border-line px-5 py-4", className)}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-1">{eyebrow}</p> : null}
        <Heading id={id} className="text-base font-semibold text-fg">
          {title}
        </Heading>
        {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function PanelBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}
