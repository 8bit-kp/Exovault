"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  forgotPasswordAction,
  resendCodeAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
  verifyEmailAction,
} from "@/app/(auth)/auth/actions";
import { AUTH_ROUTES } from "@/config/navigation";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";
import { IDLE } from "@/lib/validation/form-state";
import { Button } from "@/components/ui/button";
import { FormMessage, PasswordField, SubmitButton, TextField } from "./form-parts";

/*
 * Every form posts to a Server Action and works without JavaScript
 * (progressive enhancement). `noValidate` keeps one error style: the
 * server's, which is the source of truth anyway.
 */

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, IDLE);
  return (
    <form action={action} noValidate className="space-y-4">
      <FormMessage state={state} />
      <TextField
        name="email"
        label="Email address"
        type="email"
        autoComplete="email"
        required
        state={state}
      />
      <PasswordField
        name="password"
        label="Password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. A long passphrase works well; no special characters required.`}
        state={state}
      />
      <SubmitButton pendingLabel="Creating account…">Create account</SubmitButton>
    </form>
  );
}

export function SignInForm({ returnTo }: { returnTo?: string }) {
  const [state, action] = useActionState(signInAction, IDLE);
  return (
    <form action={action} noValidate className="space-y-4">
      <FormMessage state={state} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <TextField
        name="email"
        label="Email address"
        type="email"
        autoComplete="email"
        required
        state={state}
      />
      <PasswordField name="password" label="Password" autoComplete="current-password" state={state} />
      <div className="flex justify-end">
        <Link
          href={AUTH_ROUTES.forgotPassword}
          className="text-sm text-accent underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
      </div>
      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
    </form>
  );
}

export function VerifyEmailForm() {
  const [state, action] = useActionState(verifyEmailAction, IDLE);
  const [resendState, resend, resendPending] = useActionState(resendCodeAction, IDLE);
  return (
    <div className="space-y-5">
      <form action={action} noValidate className="space-y-4">
        <FormMessage state={state} />
        <TextField
          name="code"
          label="Verification code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          className="font-mono text-lg tracking-[0.4em]"
          hint="6 digits. Expires 10 minutes after it was sent."
          state={state}
        />
        <SubmitButton pendingLabel="Verifying…">Verify email</SubmitButton>
      </form>
      <form action={resend} className="space-y-3 border-t border-line pt-4">
        <FormMessage state={resendState} />
        <Button type="submit" variant="ghost" size="sm" className="w-full" disabled={resendPending}>
          {resendPending ? "Sending…" : "Send a new code"}
        </Button>
      </form>
    </div>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, IDLE);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} noValidate className="space-y-4">
      <FormMessage state={state} />
      <TextField
        name="email"
        label="Email address"
        type="email"
        autoComplete="email"
        required
        state={state}
      />
      <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, IDLE);
  return (
    <form action={action} noValidate className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <PasswordField
        name="password"
        label="New password"
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters. Resetting signs you out on every device.`}
        state={state}
      />
      <PasswordField
        name="confirmPassword"
        label="Confirm new password"
        autoComplete="new-password"
        state={state}
      />
      <SubmitButton pendingLabel="Saving…">Set new password</SubmitButton>
    </form>
  );
}
