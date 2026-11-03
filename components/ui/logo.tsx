import Image from "next/image";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils/cn";

/**
 * The Consltek logo (white, for the dark theme) with "Breach Monitoring"
 * beneath it. The image file is 220×31; it is drawn 16px tall on phones and 20px from `sm` up.
 */
export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <span className={cn("inline-flex flex-col items-start gap-1 text-fg", className)}>
      <Image
        src="/brand/consltek-logo-white.png"
        alt={showWordmark ? brand.wordmark.primary : brand.name}
        width={220}
        height={31}
        priority
        className="h-4 w-auto sm:h-5"
      />
      {showWordmark ? (
        <span className="text-2xs font-medium tracking-[0.06em] sm:tracking-[0.14em] whitespace-nowrap text-fg-muted uppercase">
          {brand.wordmark.secondary}
        </span>
      ) : null}
    </span>
  );
}
