import type { Metadata } from "next";
import { NotYetAvailable } from "@/components/layout/not-yet-available";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Exposures" };

export default async function Page() {
  await requireUser();
  return (
    <NotYetAvailable
      title="Exposures"
      description="Exposures appear here after your first scan. Scanning opens once you can add an identity."
    />
  );
}
