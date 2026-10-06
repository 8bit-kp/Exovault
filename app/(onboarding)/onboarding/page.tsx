import type { Metadata } from "next";
import { Fingerprint, ListChecks, ScanLine } from "lucide-react";
import { brand } from "@/config/brand";
import { OnboardingShell } from "@/components/layout/onboarding-shell";
import { ButtonLink } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Welcome" };

export default async function OnboardingWelcome() {
  await requireUser();
  return (
    <OnboardingShell
      step="account"
      title={`Welcome to ${brand.name}`}
      description="Your account is ready. Here's what happens next. It takes about a minute."
    >
      <ol className="space-y-4">
        {[
          {
            icon: Fingerprint,
            title: "Choose the address to check",
            body: "Your sign-in email, or another address you can prove is yours.",
          },
          {
            icon: ScanLine,
            title: "Run a scan",
            body: "We ask documented breach sources about that address. You see each step.",
          },
          {
            icon: ListChecks,
            title: "Act on what we find",
            body: "Each finding comes with a plain-language checklist.",
          },
        ].map((item) => (
          <li key={item.title} className="flex gap-3">
            <item.icon aria-hidden className="mt-0.5 size-5 shrink-0 text-accent" />
            <div>
              <p className="text-sm font-medium text-fg">{item.title}</p>
              <p className="text-sm text-fg-muted">{item.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <ButtonLink href="/onboarding/identity" className="mt-8 w-full">
        Get started
      </ButtonLink>
    </OnboardingShell>
  );
}
