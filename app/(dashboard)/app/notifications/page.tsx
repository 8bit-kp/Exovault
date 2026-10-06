import type { Metadata } from "next";
import { NotYetAvailable } from "@/components/layout/not-yet-available";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Notifications" };

export default async function Page() {
  await requireUser();
  return (
    <NotYetAvailable
      title="Notifications"
      description="Email alerts for new exposures are planned with scheduled monitoring."
    />
  );
}
