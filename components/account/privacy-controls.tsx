"use client";

import { Download, LoaderCircle } from "lucide-react";
import { useActionState, useState } from "react";
import { requestDeletionAction } from "@/app/(dashboard)/app/settings/privacy/actions";
import { FormMessage, PasswordField, SubmitButton } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { IDLE } from "@/lib/validation/form-state";

const EXPORT_ERRORS: Record<number, string> = {
  401: "Your session ended. Sign in again to download your data.",
  429: "You've downloaded your data several times this hour. Try again later.",
};

/** POSTs to the export endpoint and saves the response as a file. Nothing is kept in the page. */
export function ExportDataButton() {
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  async function download() {
    setState({ busy: true, error: null });
    try {
      const response = await fetch("/api/account/export", { method: "POST" });
      if (!response.ok) {
        setState({
          busy: false,
          error: EXPORT_ERRORS[response.status] ?? "The download didn't work. Please try again.",
        });
        return;
      }
      const filename =
        /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? "export.json";
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      setState({ busy: false, error: null });
    } catch {
      setState({ busy: false, error: "The download didn't work. Check your connection and try again." });
    }
  }

  return (
    <div className="space-y-3">
      <Button variant="secondary" onClick={download} disabled={state.busy} aria-disabled={state.busy}>
        {state.busy ? (
          <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />
        ) : (
          <Download aria-hidden />
        )}
        {state.busy ? "Preparing…" : "Download my data (JSON)"}
      </Button>
      {state.error ? <Callout tone="danger" role="alert" title={state.error} /> : null}
    </div>
  );
}

export function DeleteAccountForm({ graceDays }: { graceDays: number }) {
  const [state, action] = useActionState(requestDeletionAction, IDLE);
  return (
    <form action={action} className="max-w-md space-y-4">
      <FormMessage state={state} />
      <PasswordField
        name="password"
        label="Your password"
        hint="We ask again because this can't be undone after the grace period."
        state={state}
        autoComplete="current-password"
      />
      <label className="flex items-start gap-3 text-sm text-fg">
        <input type="checkbox" name="confirm" required className="mt-1 size-4 accent-(--ev-danger)" />
        <span>
          Delete my account and everything in it after {graceDays} days. I can cancel by signing in before
          then.
        </span>
      </label>
      {state.fieldErrors?.confirm ? (
        <p className="text-xs font-medium text-danger">{state.fieldErrors.confirm}</p>
      ) : null}
      <SubmitButton pendingLabel="Scheduling…" variant="danger" fullWidth={false}>
        Delete my account
      </SubmitButton>
    </form>
  );
}
