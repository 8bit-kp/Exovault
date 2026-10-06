import type { ComponentProps } from "react";
import { cn } from "@/lib/utils/cn";

/** Neutral, low-emphasis label (data categories, source type, provider names). */
export function Tag({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border border-line bg-surface-2 px-1.5 py-0.5 text-xs text-fg-muted",
        className,
      )}
      {...props}
    />
  );
}
