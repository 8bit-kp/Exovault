"use client";

import { RefreshCw, ScanLine } from "lucide-react";
import { useActionState } from "react";
import { retryScanAction, startScanAction } from "@/app/(dashboard)/app/scans/actions";
import { FormMessage, SubmitButton } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { IDLE } from "@/lib/validation/form-state";

type Flow = "onboarding" | "app";

export function StartScanForm({
  identityId,
  flow,
  label = "Run scan",
  availableInSeconds = 0,
}: {
  identityId: string;
  flow: Flow;
  label?: string;
  /** Manual-scan cooldown remaining; the button explains itself instead of failing on click. */
  availableInSeconds?: number;
}) {
  const [state, action] = useActionState(startScanAction, IDLE);
  if (availableInSeconds > 0) {
    const minutes = Math.ceil(availableInSeconds / 60);
    return (
      <p className="text-sm text-fg-muted">
        Scanned recently. You can scan again in about {minutes} minute{minutes === 1 ? "" : "s"}.
      </p>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="identityId" value={identityId} />
      <input type="hidden" name="flow" value={flow} />
      <SubmitButton pendingLabel="Starting scan…">
        <ScanLine aria-hidden /> {label}
      </SubmitButton>
    </form>
  );
}

export function RetryFailedSourcesForm({ scanId, flow }: { scanId: string; flow: Flow }) {
  const [state, action, pending] = useActionState(retryScanAction, IDLE);
  return (
    <form action={action} className="space-y-2">
      <FormMessage state={state} />
      <input type="hidden" name="scanId" value={scanId} />
      <input type="hidden" name="flow" value={flow} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        <RefreshCw aria-hidden /> {pending ? "Retrying…" : "Retry failed source"}
      </Button>
    </form>
  );
}
