import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { AppNav } from "./app-nav";
import { MobileNav } from "./mobile-nav";

interface AppShellProps {
  children: ReactNode;
  /** Sidebar account block (masked email + sign out). */
  account?: ReactNode;
  /** Compact account control for the mobile top bar. */
  accountCompact?: ReactNode;
  /** Optional banner above content, e.g. the "Demo data" notice in mock mode. */
  banner?: ReactNode;
}

/**
 * Signed-in layout: fixed sidebar on large screens, top bar + drawer below.
 * The shell holds no data; pages fetch and authorize their own (D-003).
 */
export function AppShell({ children, account, accountCompact, banner }: AppShellProps) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="hidden border-r border-line bg-surface-1/50 lg:flex lg:flex-col">
        <div className="flex h-16 items-center border-b border-line px-5">
          <Link href="/app/dashboard" className="rounded-sm">
            <Logo />
          </Link>
        </div>
        <nav aria-label="App" className="flex-1 p-3">
          <AppNav />
        </nav>
        {account ? <div className="border-t border-line p-3">{account}</div> : null}
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur-md lg:hidden">
          <div className="flex items-center gap-2">
            <MobileNav />
            <Link href="/app/dashboard" className="rounded-sm">
              <Logo />
            </Link>
          </div>
          {accountCompact}
        </header>
        {banner}
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
