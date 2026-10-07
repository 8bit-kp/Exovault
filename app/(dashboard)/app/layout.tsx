import { AccountSummary } from "@/components/account/account-summary";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/session";
import { unreadCount } from "@/server/services/notification/notification-service";

/**
 * Every /app page renders inside this layout, which checks the session on the
 * server. Pages and actions still check again themselves (D-003): layouts
 * don't re-run on client-side navigation.
 */
export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await requireUser();
  const unread = await unreadCount(user.id);
  return (
    <AppShell
      badges={{ notifications: unread }}
      account={<AccountSummary email={user.email} />}
      accountCompact={<AccountSummary email={user.email} compact />}
    >
      {children}
    </AppShell>
  );
}
