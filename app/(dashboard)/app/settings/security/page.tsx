import type { Metadata } from "next";
import { AUTH_ROUTES } from "@/config/navigation";
import { SessionList } from "@/components/account/session-list";
import { SettingsNav } from "@/components/account/settings-nav";
import { AuthLink } from "@/components/auth/auth-link";
import { PageHeader } from "@/components/layout/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { requireSession } from "@/lib/auth/session";
import { formatDateTime, isoString } from "@/lib/utils/format";
import { describeUserAgent } from "@/lib/utils/user-agent";
import { listSessions } from "@/server/services/account/session-service";

export const metadata: Metadata = { title: "Security settings" };

export default async function SecuritySettingsPage() {
  const { user, session } = await requireSession();
  const sessions = await listSessions(user.id);
  return (
    <div className="space-y-8">
      <PageHeader title="Settings" description={<SettingsNav current="security" />} />
      <Panel>
        <PanelHeader
          title="Signed-in sessions"
          description="Sessions last 7 days. We store the browser type for this list, never your IP address."
        />
        <PanelBody>
          <SessionList
            sessions={sessions.map((s) => ({
              id: s.id,
              device: describeUserAgent(s.userAgent),
              lastActive: formatDateTime(s.updatedAt),
              lastActiveIso: isoString(s.updatedAt),
              current: s.id === session.id,
            }))}
          />
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="Password" />
        <PanelBody className="text-sm text-fg-muted">
          To change your password, use <AuthLink href={AUTH_ROUTES.forgotPassword}>reset password</AuthLink>.
          Resetting signs you out everywhere.
        </PanelBody>
      </Panel>
      <Panel>
        <PanelHeader title="Two-factor authentication" />
        <PanelBody className="text-sm text-fg-muted">
          Not available yet. Authenticator-app codes and passkeys are planned.
        </PanelBody>
      </Panel>
    </div>
  );
}
