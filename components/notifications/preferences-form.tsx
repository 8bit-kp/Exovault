"use client";

import { useActionState } from "react";
import { savePreferencesAction } from "@/app/(dashboard)/app/settings/notifications/actions";
import { FormMessage, SubmitButton } from "@/components/auth/form-parts";
import { SEVERITY_META } from "@/components/exposure/severity-meta";
import { EXPOSURE_SEVERITIES } from "@/lib/domain/exposure";
import type { NotificationPreferences } from "@/lib/domain/notifications";
import { IDLE } from "@/lib/validation/form-state";

const field = "h-10 rounded-md border border-line-strong bg-bg px-2 text-sm text-fg";

export function PreferencesForm({
  initial,
  timezones,
}: {
  initial: NotificationPreferences;
  timezones: string[];
}) {
  const [state, action] = useActionState(savePreferencesAction, IDLE);
  const error = (key: string) =>
    state.fieldErrors?.[key] ? (
      <p className="text-xs font-medium text-danger">{state.fieldErrors[key]}</p>
    ) : null;
  return (
    <form action={action} className="space-y-6">
      <FormMessage state={state} />

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="emailEnabled"
          defaultChecked={initial.emailEnabled}
          className="mt-1 size-4 accent-(--ev-accent)"
        />
        <span>
          <span className="block text-sm font-medium text-fg">Email me when monitoring finds something</span>
          <span className="block text-xs text-fg-muted">
            New exposures, or known ones that got more serious. Never the same exposure twice.
          </span>
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm text-fg">
          <span className="block font-medium">Minimum severity</span>
          <select name="minSeverity" defaultValue={initial.minSeverity} className={`${field} w-full`}>
            {EXPOSURE_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {SEVERITY_META[s].label} and above
              </option>
            ))}
          </select>
          {error("minSeverity")}
        </label>
        <fieldset className="space-y-1 text-sm text-fg">
          <legend className="font-medium">Delivery</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              value="immediate"
              defaultChecked={initial.mode === "immediate"}
              className="accent-(--ev-accent)"
            />
            As soon as it&apos;s found
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              value="digest"
              defaultChecked={initial.mode === "digest"}
              className="accent-(--ev-accent)"
            />
            One daily summary (08:00 your time)
          </label>
          {error("mode")}
        </fieldset>
      </div>

      <fieldset className="space-y-3 rounded-md border border-line p-4">
        <legend className="px-1 text-sm font-medium text-fg">Quiet hours</legend>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            name="quietEnabled"
            defaultChecked={initial.quietHours.enabled}
            className="size-4 accent-(--ev-accent)"
          />
          Hold alerts during these hours and send them afterwards
        </label>
        <div className="flex flex-wrap gap-4">
          <label className="space-y-1 text-xs text-fg-muted">
            <span className="block">From</span>
            <input type="time" name="quietStart" defaultValue={initial.quietHours.start} className={field} />
          </label>
          <label className="space-y-1 text-xs text-fg-muted">
            <span className="block">Until</span>
            <input type="time" name="quietEnd" defaultValue={initial.quietHours.end} className={field} />
          </label>
        </div>
        {error("quietHours.start")}
        {error("quietHours.end")}
      </fieldset>

      <label className="block space-y-1 text-sm text-fg">
        <span className="block font-medium">Your timezone</span>
        <select name="timezone" defaultValue={initial.timezone} className={`${field} w-full max-w-sm`}>
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
        <span className="block text-xs text-fg-muted">
          Used for quiet hours, the daily summary, and times in alert emails.
        </span>
        {error("timezone")}
      </label>

      <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
    </form>
  );
}
