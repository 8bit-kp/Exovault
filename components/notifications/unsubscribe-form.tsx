"use client";

import Link from "next/link";
import { useActionState } from "react";
import { unsubscribeAction } from "@/app/(marketing)/notifications/unsubscribe/actions";
import { SubmitButton } from "@/components/auth/form-parts";
import { Callout } from "@/components/ui/callout";

/** Confirmation step: link scanners that "click" emails only do a GET, which changes nothing. */
export function UnsubscribeForm({ token }: { token: string }) {
  const [state, action] = useActionState(unsubscribeAction, {
    status: "idle" as "idle" | "done" | "invalid",
  });
  if (state.status === "done") {
    return (
      <Callout tone="ok" role="status" title="Alert emails are off.">
        Monitoring keeps running and new findings still appear on your dashboard. You can turn emails back on
        in{" "}
        <Link href="/app/settings/notifications" className="underline">
          notification settings
        </Link>
        .
      </Callout>
    );
  }
  return (
    <form action={action} className="space-y-4">
      {state.status === "invalid" ? (
        <Callout tone="danger" role="alert" title="This link is invalid or has expired.">
          Sign in and change alerts in notification settings instead.
        </Callout>
      ) : null}
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingLabel="Turning off…">Turn off alert emails</SubmitButton>
    </form>
  );
}
