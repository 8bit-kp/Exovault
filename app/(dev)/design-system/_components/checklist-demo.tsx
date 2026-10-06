"use client";

import { RemediationChecklist, type RemediationItem } from "@/components/exposure/remediation-checklist";

const ITEMS: RemediationItem[] = [
  {
    id: "change-password",
    label: "Change the password for this account",
    description: "Use a unique password from a password manager.",
    done: true,
  },
  { id: "reused", label: "Change it anywhere you reused it", done: false },
  {
    id: "mfa",
    label: "Turn on two-factor authentication",
    description: "An authenticator app or passkey is stronger than SMS.",
    done: false,
  },
  { id: "activity", label: "Review recent account activity", done: false },
];

/** Gallery-only: simulates a save. The real checklist persists via a Server Action (Phase 8). */
export function ChecklistDemo({ failing = false }: { failing?: boolean }) {
  return (
    <RemediationChecklist
      items={ITEMS}
      onToggle={async () => {
        await new Promise((resolve) => setTimeout(resolve, 400));
        if (failing) throw new Error("demo failure");
      }}
    />
  );
}
