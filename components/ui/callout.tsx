import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

type Tone = "info" | "ok" | "warn" | "danger";

const tones: Record<Tone, { icon: LucideIcon; classes: string; label: string }> = {
  info: { icon: Info, classes: "border-line-strong bg-surface-2 [--tone:var(--ev-accent)]", label: "Note" },
  ok: { icon: CircleCheck, classes: "border-ok/40 bg-ok/8 [--tone:var(--ev-ok)]", label: "Success" },
  warn: {
    icon: TriangleAlert,
    classes: "border-warn/40 bg-warn/8 [--tone:var(--ev-warn)]",
    label: "Warning",
  },
  danger: {
    icon: CircleAlert,
    classes: "border-danger/45 bg-danger/8 [--tone:var(--ev-danger)]",
    label: "Error",
  },
};

interface CalloutProps {
  tone?: Tone;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  /** "status" announces politely; "alert" interrupts. Omit for static content. */
  role?: "status" | "alert";
  className?: string;
}

/** Inline message block. The icon and the hidden tone label mean it never relies on colour. */
export function Callout({ tone = "info", title, children, action, role, className }: CalloutProps) {
  const { icon: Icon, classes, label } = tones[tone];
  return (
    <div role={role} className={cn("flex gap-3 rounded-md border px-4 py-3", classes, className)}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-(--tone)" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-fg">
          <span className="sr-only">{label}: </span>
          {title}
        </p>
        {children ? <div className="mt-1 text-fg-muted">{children}</div> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}
