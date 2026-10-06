import type { Metadata } from "next";
import { NotYetAvailable } from "@/components/layout/not-yet-available";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Monitoring" };

export default async function Page() {
  await requireUser();
  return (
    <NotYetAvailable
      title="Monitoring"
      description="Scheduled monitoring isn't built yet. For now, scans run only when you start them."
    />
  );
}
