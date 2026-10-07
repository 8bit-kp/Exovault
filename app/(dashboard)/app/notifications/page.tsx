import type { Metadata } from "next";
import { BellOff } from "lucide-react";
import Link from "next/link";
import { markAllReadAction } from "@/app/(dashboard)/app/settings/notifications/actions";
import { SeverityBadge } from "@/components/exposure/severity-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/lib/auth/session";
import { formatDateTime, isoString } from "@/lib/utils/format";
import {
  getPreferences,
  listNotifications,
  type NotificationView,
} from "@/server/services/notification/notification-service";

export const metadata: Metadata = { title: "Notifications" };

function deliveryText(n: NotificationView, timeZone: string): string {
  switch (n.status) {
    case "sent":
      return n.sentAt ? `Emailed ${formatDateTime(n.sentAt, { timeZone })}` : "Emailed";
    case "pending":
    case "sending":
      return n.digest
        ? `In your daily summary, ${formatDateTime(n.scheduledFor, { timeZone })}`
        : `Will be emailed ${formatDateTime(n.scheduledFor, { timeZone })} (after quiet hours)`;
    case "suppressed":
      return n.suppressionReason === "below_min_severity"
        ? "Not emailed: below your minimum severity"
        : n.suppressionReason === "email_disabled"
          ? "Not emailed: alert emails are off"
          : "Not emailed: the exposure was removed";
    case "failed":
      return "Email couldn't be delivered";
  }
}

export default async function NotificationsPage() {
  const user = await requireUser();
  const [notifications, prefs] = await Promise.all([listNotifications(user.id), getPreferences(user.id)]);
  const unread = notifications.filter((n) => !n.read).length;
  return (
    <div className="space-y-8">
      <PageHeader
        title="Notifications"
        description={
          <>
            Alerts from scheduled monitoring, kept for 90 days. Times are in {prefs.timezone}.{" "}
            <Link href="/app/settings/notifications" className="text-accent underline underline-offset-4">
              Alert settings
            </Link>
          </>
        }
        action={
          unread > 0 ? (
            <form action={markAllReadAction}>
              <Button type="submit" variant="secondary" size="sm">
                Mark all as read
              </Button>
            </form>
          ) : undefined
        }
      />
      {notifications.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="No alerts yet"
          description="When scheduled monitoring finds a new exposure, or a known one gets more serious, it appears here and (if you've chosen) in your inbox."
        />
      ) : (
        <ul
          className="divide-y divide-line rounded-lg border border-line bg-surface-1"
          aria-label="Notifications"
        >
          {notifications.map((n) => (
            <li key={n.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
              <span
                aria-hidden
                className={`mt-2 size-2 shrink-0 rounded-full ${n.read ? "" : "bg-accent"}`}
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {!n.read ? <span className="sr-only">Unread.</span> : null}
                  <SeverityBadge severity={n.severity} size="sm" />
                  <span className="text-sm font-medium text-fg">
                    {n.kind === "new_exposure" ? "New exposure" : "Exposure got more serious"}
                    {": "}
                    {n.sourceName ?? (n.exposureExists ? "sensitive source (hidden)" : "removed")}
                  </span>
                </div>
                <p className="text-xs text-fg-muted">
                  Found{" "}
                  <time dateTime={isoString(n.createdAt)}>
                    {formatDateTime(n.createdAt, { timeZone: prefs.timezone })}
                  </time>
                  {" · "}
                  {deliveryText(n, prefs.timezone)}
                </p>
              </div>
              {n.exposureExists ? (
                <Link
                  href={`/app/exposures/${n.exposureId}`}
                  className="text-sm text-accent underline-offset-4 hover:underline"
                >
                  View
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
