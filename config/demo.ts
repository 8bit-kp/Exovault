import { getEnv } from "@/config/env";
import type { FormState } from "@/lib/validation/form-state";

/**
 * Showcase mode (D-041): one shared, pre-verified demo account with fictional
 * data. Public sign-up, password reset, adding or removing addresses, account
 * deletion and revoking other viewers' sessions are refused on the server, and
 * no email leaves the app. The demo data is restored by the daily cron.
 */
export function isDemoMode(): boolean {
  return getEnv().DEMO_MODE === "on";
}

export function demoAccount(): { email: string; password: string | null } {
  const env = getEnv();
  return { email: env.DEMO_ACCOUNT_EMAIL, password: env.DEMO_ACCOUNT_PASSWORD ?? null };
}

export const DEMO_DISABLED_MESSAGE =
  "This is turned off in the demo, so the shared account stays the same for everyone who tries it.";

/** For Server Actions: the refusal to return in demo mode, or null to carry on. */
export function demoGuard(): FormState | null {
  return isDemoMode() ? { status: "error", message: DEMO_DISABLED_MESSAGE } : null;
}

/** Where "Check your exposure" leads: sign-up normally, the demo sign-in in demo mode. */
export function primaryCta(): { href: string; label: string } {
  return isDemoMode()
    ? { href: "/auth/sign-in", label: "Try the demo" }
    : { href: "/auth/sign-up", label: "Check your exposure" };
}
