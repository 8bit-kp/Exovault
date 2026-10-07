"use client";

import { Check } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { cn } from "@/lib/utils/cn";

export interface RemediationItem {
  id: string;
  label: string;
  description?: string;
  done: boolean;
}

interface RemediationChecklistProps {
  items: RemediationItem[];
  /**
   * Persists a change (a Server Action in Phase 8). Rejecting reverts the
   * optimistic tick, and the error message is announced.
   */
  onToggle: (id: string, done: boolean) => Promise<void>;
  title?: string;
  /** Hide the visible title when the surrounding panel already has one (it stays for screen readers). */
  hideTitle?: boolean;
  className?: string;
}

/**
 * Native checkboxes (keyboard and screen reader behaviour for free) styled as
 * an instrument checklist. Progress is announced politely as items change.
 */
export function RemediationChecklist({
  items,
  onToggle,
  title = "What to do now",
  hideTitle = false,
  className,
}: RemediationChecklistProps) {
  const [optimisticItems, setOptimistic] = useOptimistic(
    items,
    (current, change: { id: string; done: boolean }) =>
      current.map((item) => (item.id === change.id ? { ...item, done: change.done } : item)),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const completed = optimisticItems.filter((item) => item.done).length;

  function toggle(id: string, done: boolean) {
    startTransition(async () => {
      setError(null);
      setOptimistic({ id, done });
      try {
        await onToggle(id, done);
      } catch {
        // The optimistic tick reverts when the transition settles.
        setError("That change wasn't saved. Check your connection and try again.");
      }
    });
  }

  return (
    <fieldset className={cn("space-y-3", className)} aria-busy={pending || undefined}>
      <legend className="flex w-full items-baseline justify-between gap-4">
        <span className={hideTitle ? "sr-only" : "text-base font-semibold text-fg"}>{title}</span>
        <span className="font-mono text-xs text-fg-muted" aria-live="polite">
          {completed} of {optimisticItems.length} done
        </span>
      </legend>
      <ul className="space-y-2">
        {optimisticItems.map((item) => {
          const inputId = `remediation-${item.id}`;
          const descriptionId = item.description ? `${inputId}-desc` : undefined;
          return (
            <li key={item.id}>
              {/* The label holds only the title, so the accessible name stays short; its ::after
                  stretches over the whole row so the entire box is still the click target. */}
              <div
                className={cn(
                  "relative flex min-h-11 gap-3 rounded-md border border-line bg-surface-1 px-4 py-3 transition-colors duration-(--duration-fast)",
                  "hover:border-line-strong has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus",
                  item.done && "bg-surface-2",
                )}
              >
                <input
                  id={inputId}
                  type="checkbox"
                  className="sr-only"
                  checked={item.done}
                  aria-describedby={descriptionId}
                  onChange={(event) => toggle(item.id, event.currentTarget.checked)}
                />
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-sm border transition-colors",
                    item.done ? "border-ok bg-ok text-bg" : "border-line-strong bg-bg",
                  )}
                >
                  {item.done ? <Check className="size-3.5" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0">
                  <label
                    htmlFor={inputId}
                    className={cn(
                      "block cursor-pointer text-sm font-medium after:absolute after:inset-0",
                      item.done ? "text-fg-muted line-through decoration-fg-subtle" : "text-fg",
                    )}
                  >
                    {item.label}
                  </label>
                  {item.description ? (
                    <span id={descriptionId} className="mt-0.5 block text-xs text-fg-muted">
                      {item.description}
                    </span>
                  ) : null}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
