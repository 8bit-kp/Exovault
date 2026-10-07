"use client";

import { Eye } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import {
  revealSourceAction,
  setChecklistItemAction,
  setRemediationStateAction,
  type RevealSourceState,
} from "@/app/(dashboard)/app/exposures/actions";
import { FormMessage } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import type { RemediationState } from "@/lib/domain/exposure";
import { DISMISS_REASON_LABELS, DISMISS_REASONS } from "@/lib/domain/remediation";
import { IDLE } from "@/lib/validation/form-state";
import { RemediationChecklist, type RemediationItem } from "./remediation-checklist";

/** Persists each tick via a Server Action; failures roll the tick back (RemediationChecklist). */
export function ExposureChecklist({ exposureId, items }: { exposureId: string; items: RemediationItem[] }) {
  const router = useRouter();
  return (
    <RemediationChecklist
      hideTitle
      items={items}
      onToggle={async (key, done) => {
        await setChecklistItemAction(exposureId, key, done);
        router.refresh(); // status, score and badges are server-rendered
      }}
    />
  );
}

export function RemediationStatusControls({
  exposureId,
  state,
}: {
  exposureId: string;
  state: RemediationState;
}) {
  const [result, action, pending] = useActionState(setRemediationStateAction, IDLE);
  return (
    <div className="space-y-3">
      <FormMessage state={result} />
      {state === "remediated" || state === "dismissed" ? (
        <form action={action}>
          <input type="hidden" name="exposureId" value={exposureId} />
          <input type="hidden" name="to" value="open" />
          <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            Reopen
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <form action={action}>
            <input type="hidden" name="exposureId" value={exposureId} />
            <input type="hidden" name="to" value="remediated" />
            <Button type="submit" size="sm" disabled={pending}>
              Mark as fixed
            </Button>
          </form>
          <form action={action} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="exposureId" value={exposureId} />
            <input type="hidden" name="to" value="dismissed" />
            <label className="text-xs text-fg-muted">
              <span className="mb-1 block">Dismiss because…</span>
              <select
                name="reason"
                required
                defaultValue=""
                className="h-9 rounded-md border border-line-strong bg-bg px-2 text-sm text-fg"
              >
                <option value="" disabled>
                  Choose a reason
                </option>
                {DISMISS_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {DISMISS_REASON_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="ghost" size="sm" disabled={pending}>
              Dismiss
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

/** Sensitive sources are hidden until the user explicitly asks (spec 2.3). */
export function RevealSourceName({ exposureId }: { exposureId: string }) {
  const [state, action, pending] = useActionState<RevealSourceState, FormData>(revealSourceAction, {
    status: "idle",
  });
  if (state.status === "revealed") return <span>{state.sourceName}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <span>Sensitive source (hidden)</span>
      <form action={action}>
        <input type="hidden" name="exposureId" value={exposureId} />
        <Button type="submit" variant="ghost" size="sm" disabled={pending}>
          <Eye aria-hidden /> Reveal source name
        </Button>
      </form>
      {state.status === "error" ? (
        <span className="text-sm text-danger">Couldn&apos;t reveal it.</span>
      ) : null}
    </span>
  );
}
