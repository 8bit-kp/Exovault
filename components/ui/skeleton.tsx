import { cn } from "@/lib/utils/cn";

/** Decorative placeholder. The surrounding LoadingState carries the accessible status. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("relative block overflow-hidden rounded-sm bg-surface-2", className)}>
      <span className="absolute inset-0 animate-sweep bg-linear-to-r from-transparent via-white/5 to-transparent" />
    </span>
  );
}
