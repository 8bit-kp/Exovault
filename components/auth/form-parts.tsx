"use client";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input } from "@/components/ui/field";
import type { FormState } from "@/lib/validation/form-state";

export function SubmitButton({
  children,
  pendingLabel,
  fullWidth = true,
}: {
  children: ReactNode;
  pendingLabel: string;
  /** Full width suits narrow auth cards; settings panels use a natural-width button. */
  fullWidth?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      className={fullWidth ? "w-full" : undefined}
      disabled={pending}
      aria-disabled={pending}
    >
      {pending ? (
        <>
          <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

/** Form-level result, announced: errors assertively, success politely. */
export function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return state.status === "error" ? (
    <Callout tone="danger" role="alert" title={state.message} />
  ) : (
    <Callout tone="ok" role="status" title={state.message} />
  );
}

interface TextFieldProps extends Omit<ComponentProps<"input">, "id" | "name"> {
  name: string;
  label: string;
  hint?: ReactNode;
  state: FormState;
}

export function TextField({ name, label, hint, state, defaultValue, ...props }: TextFieldProps) {
  return (
    <Field label={label} hint={hint} error={state.fieldErrors?.[name]}>
      {({ id, describedBy, invalid }) => (
        <Input
          id={id}
          name={name}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          defaultValue={state.values?.[name] ?? defaultValue}
          {...props}
        />
      )}
    </Field>
  );
}

/** Password input with a show/hide toggle. Values are never echoed back from the server. */
export function PasswordField({
  name,
  label,
  hint,
  state,
  autoComplete,
  minLength,
}: {
  name: string;
  label: string;
  hint?: ReactNode;
  state: FormState;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} hint={hint} error={state.fieldErrors?.[name]}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <Input
            id={id}
            name={name}
            type={visible ? "text" : "password"}
            autoComplete={autoComplete}
            minLength={minLength}
            maxLength={128}
            required
            spellCheck={false}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className="pr-11"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md text-fg-subtle hover:text-fg"
          >
            {visible ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
            <span className="sr-only">{visible ? "Hide password" : "Show password"}</span>
          </button>
        </div>
      )}
    </Field>
  );
}
