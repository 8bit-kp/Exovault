import { FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Required on any UI that renders mock-provider or illustrative data
 * (spec 4.3 trust principle). Never remove it to make a screenshot look real.
 */
export function DemoDataLabel({
  className,
  children = "Demo data",
}: {
  className?: string;
  children?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border border-dashed border-warn/60 px-1.5 py-0.5",
        "font-mono text-2xs tracking-wider text-warn uppercase",
        className,
      )}
    >
      <FlaskConical aria-hidden className="size-3" />
      {children}
    </span>
  );
}
