"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  Fingerprint,
  LayoutDashboard,
  Radar,
  Settings,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { APP_NAV, type AppNavIcon } from "@/config/navigation";
import { cn } from "@/lib/utils/cn";

const ICONS: Record<AppNavIcon, LucideIcon> = {
  dashboard: LayoutDashboard,
  exposures: ShieldAlert,
  identities: Fingerprint,
  monitoring: Radar,
  timeline: Activity,
  notifications: Bell,
  settings: Settings,
};

/** True when `pathname` is the item or a child of it ("/app/exposures/123" → Exposures). */
export function isNavItemActive(href: string, pathname: string): boolean {
  const section = href.startsWith("/app/settings") ? "/app/settings" : href;
  return pathname === section || pathname.startsWith(`${section}/`);
}

export type NavBadges = Partial<Record<AppNavIcon, number>>;

export function AppNav({
  onNavigate,
  className,
  badges = {},
}: {
  onNavigate?: () => void;
  className?: string;
  /** Counts shown next to items, e.g. unread notifications. */
  badges?: NavBadges;
}) {
  const pathname = usePathname();
  return (
    <ul className={cn("space-y-0.5", className)}>
      {APP_NAV.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isNavItemActive(item.href, pathname);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-(--duration-fast)",
                active ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2/60 hover:text-fg",
              )}
            >
              {active ? (
                <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />
              ) : null}
              <Icon aria-hidden className={cn("size-4", active ? "text-accent" : "text-fg-subtle")} />
              {item.label}
              {badges[item.icon] ? (
                <span className="ml-auto rounded-sm bg-accent px-1.5 font-mono text-2xs font-semibold text-accent-fg">
                  {badges[item.icon]! > 99 ? "99+" : badges[item.icon]}
                  <span className="sr-only"> unread</span>
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
