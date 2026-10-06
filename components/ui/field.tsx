import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

const control =
  "block h-10 w-full rounded-md border border-line-strong bg-bg px-3 text-base text-fg placeholder:text-fg-subtle " +
  "transition-colors duration-(--duration-fast) hover:border-fg-subtle " +
  "focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-offset-0 " +
  "aria-invalid:border-danger disabled:opacity-60";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, className)} {...props} />;
}

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Render prop receives the ids so label, hint and error are always wired up. */
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  className?: string;
}

/** Label + control + hint + error, with aria-describedby and aria-invalid handled once. */
export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint ? (
        <p id={hintId} className="text-xs text-fg-subtle">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
