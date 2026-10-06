import { brand } from "@/config/brand";
import { cn } from "@/lib/utils/cn";

/**
 * Wordmark + vault glyph: a square aperture with an offset inner bracket,
 * drawn in currentColor so it inherits text colour.
 */
export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-fg", className)}>
      <svg viewBox="0 0 24 24" aria-hidden className="size-6 shrink-0" fill="none">
        <rect x="2.5" y="2.5" width="19" height="19" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 7.5H6.5v9H8M16 7.5h1.5v9H16" className="stroke-accent" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="1.75" className="fill-accent" />
      </svg>
      {showWordmark ? (
        <span className="font-mono text-sm font-semibold tracking-[0.18em] uppercase">{brand.name}</span>
      ) : (
        <span className="sr-only">{brand.name}</span>
      )}
    </span>
  );
}
