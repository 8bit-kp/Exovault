"use client";

import { Eye, EyeOff, Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  addIdentityAction,
  removeIdentityAction,
  resendIdentityCodeAction,
  revealIdentityAction,
  verifyIdentityAction,
  type RevealState,
} from "@/app/(dashboard)/app/identities/actions";
import { FormMessage, SubmitButton, TextField } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { IDLE } from "@/lib/validation/form-state";

type Flow = "onboarding" | "app";

export function AddIdentityForm({ flow, accountEmailMasked }: { flow: Flow; accountEmailMasked: string }) {
  const [state, action] = useActionState(addIdentityAction, IDLE);
  return (
    <div className="space-y-6">
      <FormMessage state={state} />
      <form action={action} className="space-y-3 rounded-md border border-line bg-surface-2 p-4">
        <input type="hidden" name="flow" value={flow} />
        <input type="hidden" name="useAccountEmail" value="1" />
        <p className="text-sm text-fg">
          Use your sign-in address <span className="font-mono">{accountEmailMasked}</span>
        </p>
        <p className="text-xs text-fg-muted">
          You already proved you own it, so there&apos;s no second code.
        </p>
        <SubmitButton pendingLabel="Adding…">Use my sign-in email</SubmitButton>
      </form>
      <div className="flex items-center gap-3 text-xs text-fg-subtle" aria-hidden>
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>
      <form action={action} noValidate className="space-y-4">
        <input type="hidden" name="flow" value={flow} />
        <TextField
          name="email"
          label="A different email address"
          type="email"
          autoComplete="off"
          hint="We'll email it a 6-digit code. Nothing is checked until the code is entered."
          state={state}
        />
        <SubmitButton pendingLabel="Sending code…">Send verification code</SubmitButton>
      </form>
    </div>
  );
}

export function VerifyIdentityForm({ identityId, flow }: { identityId: string; flow: Flow }) {
  const [state, action] = useActionState(verifyIdentityAction, IDLE);
  const [resendState, resend, resending] = useActionState(resendIdentityCodeAction, IDLE);
  return (
    <div className="space-y-5">
      <form action={action} noValidate className="space-y-4">
        <FormMessage state={state} />
        <input type="hidden" name="identityId" value={identityId} />
        <input type="hidden" name="flow" value={flow} />
        <TextField
          name="code"
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          className="font-mono text-lg tracking-[0.4em]"
          hint="6 digits, from the email sent to this address. Expires 15 minutes after it was sent."
          state={state}
        />
        <SubmitButton pendingLabel="Verifying…">Verify address</SubmitButton>
      </form>
      <form action={resend} className="space-y-3 border-t border-line pt-4">
        <FormMessage state={resendState} />
        <input type="hidden" name="identityId" value={identityId} />
        <Button type="submit" variant="ghost" size="sm" className="w-full" disabled={resending}>
          {resending ? "Sending…" : "Send a new code"}
        </Button>
      </form>
    </div>
  );
}

const REVEAL_SECONDS = 30;

/** Masked by default; the full value is fetched on demand, shown briefly, then discarded from state. */
export function RevealIdentity({ identityId, masked }: { identityId: string; masked: string }) {
  const [state, action, pending] = useActionState<RevealState, FormData>(revealIdentityAction, {
    status: "idle",
  });
  const [hidden, setHidden] = useState(true);
  const lastValue = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (state.status !== "revealed" || state.value === lastValue.current) return;
    lastValue.current = state.value;
    setHidden(false);
    const timer = setTimeout(() => setHidden(true), REVEAL_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [state]);

  const showing = !hidden && state.status === "revealed";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-mono text-lg text-fg" aria-live="polite">
        {showing ? state.value : masked}
      </span>
      {showing ? (
        <Button variant="ghost" size="sm" onClick={() => setHidden(true)}>
          <EyeOff aria-hidden /> Hide
        </Button>
      ) : (
        <form action={action}>
          <input type="hidden" name="identityId" value={identityId} />
          <Button type="submit" variant="ghost" size="sm" disabled={pending}>
            <Eye aria-hidden /> Reveal full address
          </Button>
        </form>
      )}
      {state.status === "error" ? (
        <span className="text-sm text-danger">Couldn&apos;t reveal it. Try again.</span>
      ) : null}
      {showing ? (
        <span className="text-xs text-fg-subtle">Hides again after {REVEAL_SECONDS} seconds.</span>
      ) : null}
    </div>
  );
}

export function RemoveIdentityButton({ identityId }: { identityId: string }) {
  const [state, action] = useActionState(removeIdentityAction, IDLE);
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button
        variant="danger"
        size="sm"
        onClick={() => dialogRef.current?.showModal()}
        aria-haspopup="dialog"
      >
        <Trash2 aria-hidden /> Remove identity
      </Button>
      <FormMessage state={state} />
      <dialog
        ref={dialogRef}
        aria-labelledby={`remove-${identityId}-title`}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface-1 p-6 text-fg shadow-overlay backdrop:bg-black/60"
      >
        <h2 id={`remove-${identityId}-title`} className="text-lg font-semibold">
          Remove this identity?
        </h2>
        <p className="mt-2 text-sm text-fg-muted">
          We&apos;ll delete the encrypted address and stop checking it. To check it again later you&apos;ll
          need to verify it again.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
            Cancel
          </Button>
          <form action={action}>
            <input type="hidden" name="identityId" value={identityId} />
            <Button type="submit" variant="danger">
              Remove
            </Button>
          </form>
        </div>
      </dialog>
    </>
  );
}
