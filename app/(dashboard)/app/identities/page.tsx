import type { Metadata } from "next";
import { NotYetAvailable } from "@/components/layout/not-yet-available";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Identities" };

export default async function Page() {
  await requireUser();
  return (
    <NotYetAvailable
      title="Identities"
      description="Adding and verifying the identifiers you want checked is coming next."
    />
  );
}
