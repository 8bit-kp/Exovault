import type { Metadata } from "next";
import { NotYetAvailable } from "@/components/layout/not-yet-available";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Timeline" };

export default async function Page() {
  await requireUser();
  return (
    <NotYetAvailable
      title="Timeline"
      description="A history of what was found and when will appear here once scans run."
    />
  );
}
