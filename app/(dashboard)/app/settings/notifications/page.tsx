import type { Metadata } from "next";
import { SettingsNav } from "@/components/account/settings-nav";
import { PageHeader } from "@/components/layout/page-header";
import { PreferencesForm } from "@/components/notifications/preferences-form";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { requireUser } from "@/lib/auth/session";
import { listTimeZones } from "@/lib/utils/timezones";
import { getPreferences } from "@/server/services/notification/notification-service";

export const metadata: Metadata = { title: "Notification settings" };

export default async function NotificationSettingsPage() {
  const user = await requireUser();
  const preferences = await getPreferences(user.id);
  const timezones = listTimeZones(preferences.timezone);
  return (
    <div className="space-y-8">
      <PageHeader title="Settings" description={<SettingsNav current="notifications" />} />
      <Panel>
        <PanelHeader
          title="Exposure alerts"
          description="Alerts come from scheduled monitoring and go to your sign-in email. Emails show your address masked and never name sensitive sources."
        />
        <PanelBody>
          <PreferencesForm initial={preferences} timezones={timezones} />
        </PanelBody>
      </Panel>
    </div>
  );
}
