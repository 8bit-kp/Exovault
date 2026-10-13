import { AccountSummary } from "@/components/account/account-summary";
import { AppShell } from "@/components/layout/app-shell";
import { requireUser } from "@/lib/auth/session";
import { brand } from "@/config/brand";
import { isDemoMode } from "@/config/demo";
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
      {isDemoMode() ? (
        <p className="mb-6 rounded-md border border-dashed border-warn/50 bg-warn/5 px-3 py-2 text-sm text-fg-muted">
          <span className="font-medium text-fg">You&apos;re in the {brand.name} demo.</span> One shared
          account, fictional data, reset every day. Account changes and emails are switched off.
        </p>
      ) : null}
      {children}
    </AppShell>
  );
}
