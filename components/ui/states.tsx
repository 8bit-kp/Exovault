import { CircleAlert, Lock, SearchX, ShieldOff, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Skeleton } from "./skeleton";

/*
 * The generic states every feature must cover (spec 13.8). Feature-specific
 * copy (e.g. "No known exposures detected in N sources") is passed in by the
 * caller; these components own layout, semantics and announcement behaviour.
 */

interface StateFrameProps {
  icon: LucideIcon;
  iconClassName?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Optional secondary detail, e.g. the scan reference for support. */
  meta?: ReactNode;
  role?: "status" | "alert";
  headingLevel?: "h1" | "h2" | "h3";
  className?: string;
}

function StateFrame({
  icon: Icon,
  iconClassName,
  title,
  description,
  action,
  meta,
  role,
  headingLevel: Heading = "h2",
  className,
}: StateFrameProps) {
  return (
    <div
      role={role}
      className={cn(
        "flex flex-col items-start gap-4 rounded-lg border border-dashed border-line-strong px-6 py-8 sm:px-8",
        className,
      )}
    >
      <span className="grid size-10 place-items-center rounded-md border border-line bg-surface-2">
        <Icon aria-hidden className={cn("size-5", iconClassName ?? "text-fg-muted")} />
      </span>
      <div className="max-w-prose space-y-1.5">
        <Heading className="text-lg font-semibold text-fg">{title}</Heading>
        {description ? <div className="text-sm text-fg-muted">{description}</div> : null}
      </div>
      {action ? <div className="flex flex-wrap gap-3">{action}</div> : null}
      {meta ? <p className="font-mono text-xs text-fg-subtle">{meta}</p> : null}
    </div>
  );
}

type EmptyStateProps = Omit<StateFrameProps, "role" | "icon"> & { icon?: LucideIcon };

/** Nothing to show yet. Not an error: neutral tone, a clear next step. */
export function EmptyState({ icon = SearchX, ...props }: EmptyStateProps) {
  return <StateFrame icon={icon} {...props} />;
}

type ErrorStateProps = Omit<StateFrameProps, "role" | "icon" | "iconClassName"> & {
  icon?: LucideIcon;
  /** Announce assertively. Use for failures caused by a user action, not on page load. */
  announce?: boolean;
};

/**
 * Something failed. Callers pass a *safe* reason (never a stack trace, provider
 * payload, or identifier) and a retry action where retrying can help.
 */
export function ErrorState({ icon = CircleAlert, announce = false, ...props }: ErrorStateProps) {
  return (
    <StateFrame icon={icon} iconClassName="text-danger" role={announce ? "alert" : undefined} {...props} />
  );
}

/** Signed in but not allowed (403), or not signed in (401). Deliberately reveals nothing about the resource. */
export function AccessState({
  kind,
  action,
  className,
}: {
  kind: "unauthorized" | "forbidden";
  action?: ReactNode;
  className?: string;
}) {
  return kind === "unauthorized" ? (
    <StateFrame
      icon={Lock}
      title="Sign in to continue"
      description="This page is only available to signed-in users."
      action={action}
      className={className}
    />
  ) : (
    <StateFrame
      icon={ShieldOff}
      title="You don't have access to this"
      description="It may belong to another account, or it may not exist."
      action={action}
      className={className}
    />
  );
}

interface LoadingStateProps {
  /** What is loading, announced to assistive tech, e.g. "Loading exposures". */
  label: string;
  /** Skeleton rows to draw. */
  rows?: number;
  className?: string;
}

/** Announces once via role=status; the skeleton itself is hidden from assistive tech. */
export function LoadingState({ label, rows = 3, className }: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" className={cn("space-y-3", className)}>
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 rounded-md border border-line bg-surface-1 px-4 py-4"
        >
          <Skeleton className="size-8 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
