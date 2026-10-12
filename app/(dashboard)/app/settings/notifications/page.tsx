import type { Metadata } from "next";
import { SettingsNav } from "@/components/account/settings-nav";
import { PageHeader } from "@/components/layout/page-header";
import { PreferencesForm } from "@/components/notifications/preferences-form";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { cronIntervalMinutes } from "@/config/scheduler";
import { requireUser } from "@/lib/auth/session";
import { listTimeZones } from "@/lib/utils/timezones";
import { getPreferences } from "@/server/services/notification/notification-service";

export const metadata: Metadata = { title: "Notification settings" };

export default async function NotificationSettingsPage() {
  const user = await requireUser();
  const preferences = await getPreferences(user.id);
  const timezones = listTimeZones(preferences.timezone);
  // With a coarse cron (D-039), the summary goes out at the first run after 08:00, not at 08:00 sharp.
  const interval = cronIntervalMinutes();
  const digestTiming =
    interval === null || interval <= 60
      ? "08:00 your time"
      : "at the first scheduled run after 08:00 your time";
  return (
    <div className="space-y-8">
      <PageHeader title="Settings" description={<SettingsNav current="notifications" />} />
      <Panel>
        <PanelHeader
          title="Exposure alerts"
          description="Alerts come from scheduled monitoring and go to your sign-in email. Emails show your address masked and never name sensitive sources."
        />
        <PanelBody>
          <PreferencesForm initial={preferences} timezones={timezones} digestTiming={digestTiming} />
        </PanelBody>
      </Panel>
    </div>
  );
}
