import Link from "next/link";
import { AUTH_ROUTES, MARKETING_NAV } from "@/config/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" className="rounded-sm">
          <Logo />
        </Link>
        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {MARKETING_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="rounded-md px-3 py-2 text-sm text-fg-muted transition-colors hover:text-fg"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <ButtonLink href={AUTH_ROUTES.signIn} variant="ghost" size="sm">
            Sign in
          </ButtonLink>
          <ButtonLink href={AUTH_ROUTES.signUp} size="sm">
            Check your exposure
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
