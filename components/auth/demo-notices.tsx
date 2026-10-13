import { Lock } from "lucide-react";
import { AuthShell } from "@/components/layout/auth-shell";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { AUTH_ROUTES } from "@/config/navigation";

/** Replaces sign-up, password reset and email verification in demo mode (D-041). */
export function DemoAuthClosed({ title }: { title: string }) {
  return (
    <AuthShell title={title}>
      <div className="space-y-4">
        <Callout tone="info" title="This deployment is a demo.">
          It runs on one shared account with fictional data, so new accounts and emails are turned off.
        </Callout>
        <ButtonLink href={AUTH_ROUTES.signIn} className="w-full">
          Sign in to the demo
        </ButtonLink>
      </div>
    </AuthShell>
  );
}

/** Stands in for a control that would change the shared demo account. */
export function DemoLockedNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-md border border-dashed border-line-strong px-3 py-2 text-sm text-fg-muted">
      <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
