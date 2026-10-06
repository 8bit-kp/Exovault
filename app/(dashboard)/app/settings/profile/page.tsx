import type { Metadata } from "next";
import { SettingsNav } from "@/components/account/settings-nav";
import { PageHeader } from "@/components/layout/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils/format";
import { maskEmail } from "@/lib/utils/mask";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfileSettingsPage() {
  const user = await requireUser();
  return (
    <div className="space-y-8">
      <PageHeader title="Settings" description={<SettingsNav current="profile" />} />
      <Panel>
        <PanelHeader title="Account" />
        <PanelBody>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-fg-subtle">Sign-in email</dt>
              <dd className="font-mono text-fg">
                {maskEmail(user.email)} <span className="font-sans text-ok">· verified</span>
              </dd>
            </div>
            <div>
              <dt className="text-fg-subtle">Member since</dt>
              <dd className="text-fg">{formatDate(user.createdAt)}</dd>
            </div>
          </dl>
        </PanelBody>
      </Panel>
    </div>
  );
}
