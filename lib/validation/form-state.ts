/** Shape returned by every form Server Action to `useActionState`. */
export interface FormState {
  status: "idle" | "error" | "success";
  /** Form-level message (safe, user-facing). */
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Echo non-secret fields so a failed submit doesn't wipe them. Never passwords. */
  values?: Record<string, string>;
}

export const IDLE: FormState = { status: "idle" };
