import { requireUser } from "@/lib/auth/session";

/** Onboarding is for signed-in, verified users only. Pages re-check too (D-003). */
export default async function OnboardingLayout({ children }: LayoutProps<"/onboarding">) {
  await requireUser();
  return children;
}
