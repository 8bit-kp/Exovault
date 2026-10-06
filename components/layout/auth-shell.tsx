import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";

interface AuthShellProps {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Small print under the form, e.g. "Already have an account? Sign in". */
  footer?: ReactNode;
}

/** Single-column, narrow, distraction-free. One primary action per screen. */
export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <div className="bg-instrument-grid flex min-h-dvh flex-col">
      <header className="px-4 py-5 sm:px-6">
        <Link href="/" className="inline-block rounded-sm">
          <Logo />
        </Link>
      </header>
      <main
        id="main"
        className="flex flex-1 items-start justify-center px-4 pt-8 pb-16 sm:items-center sm:pt-0"
      >
        <div className="w-full max-w-sm">
          <div className="rounded-lg border border-line bg-surface-1 p-6 shadow-overlay sm:p-8">
            <h1 className="text-2xl font-semibold text-fg">{title}</h1>
            {description ? <div className="mt-2 text-sm text-fg-muted">{description}</div> : null}
            <div className="mt-6">{children}</div>
          </div>
          {footer ? <div className="mt-4 text-center text-sm text-fg-muted">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
