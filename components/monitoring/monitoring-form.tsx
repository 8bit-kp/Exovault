"use client";

import { useActionState } from "react";
import { setMonitoringAction } from "@/app/(dashboard)/app/monitoring/actions";
import { FormMessage, SubmitButton } from "@/components/auth/form-parts";
import { FREQUENCY_LABELS, MONITORING_FREQUENCIES, type MonitoringFrequency } from "@/lib/domain/monitoring";
import { IDLE } from "@/lib/validation/form-state";

export function MonitoringForm({
  identityId,
  enabled,
  frequency,
}: {
  identityId: string;
  enabled: boolean;
  frequency: MonitoringFrequency | null;
}) {
  const [state, action] = useActionState(setMonitoringAction, IDLE);
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="identityId" value={identityId} />
      {enabled ? (
        <>
          <input type="hidden" name="enabled" value="false" />
          <SubmitButton pendingLabel="Turning off…">Turn off monitoring</SubmitButton>
        </>
      ) : (
        <>
          <input type="hidden" name="enabled" value="true" />
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-fg">How often should we check?</legend>
            <div className="flex flex-wrap gap-2">
              {MONITORING_FREQUENCIES.map((f) => (
                <label
                  key={f}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm has-checked:border-accent has-focus-visible:outline-2 has-focus-visible:outline-focus"
                >
                  <input
                    type="radio"
                    name="frequency"
                    value={f}
                    defaultChecked={f === (frequency ?? "24h")}
                    className="accent-(--ev-accent)"
                  />
                  {FREQUENCY_LABELS[f]}
                </label>
              ))}
            </div>
          </fieldset>
          <SubmitButton pendingLabel="Turning on…">Turn on monitoring</SubmitButton>
        </>
      )}
    </form>
  );
}
