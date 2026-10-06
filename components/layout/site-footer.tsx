import Link from "next/link";
import { brand } from "@/config/brand";
import { Logo } from "@/components/ui/logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto]">
        <div className="max-w-md space-y-3">
          <Logo />
          <p className="text-sm text-fg-muted">
            {brand.name} reports what its configured providers know about identifiers you have verified. It is
            not a dark-web crawler, it does not cover every breach, and it can&apos;t guarantee your safety.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <li>
              <Link href="/#how-it-works" className="text-fg-muted hover:text-fg">
                How it works
              </Link>
            </li>
            <li>
              <Link href="/#privacy" className="text-fg-muted hover:text-fg">
                Privacy design
              </Link>
            </li>
            <li>
              <Link href="/#limitations" className="text-fg-muted hover:text-fg">
                Limitations
              </Link>
            </li>
            <li>
              <a href={`mailto:${brand.supportEmail}`} className="text-fg-muted hover:text-fg">
                Report a security issue
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-4 py-4 font-mono text-2xs text-fg-subtle sm:px-6">
          {brand.name} · portfolio project · not legal or security advice
        </p>
      </div>
    </footer>
  );
}
