import type { Metadata } from "next";
import Link from "next/link";
import { DeleteAccountForm, ExportDataButton } from "@/components/account/privacy-controls";
import { SettingsNav } from "@/components/account/settings-nav";
import { PageHeader } from "@/components/layout/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { getEnv } from "@/config/env";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Privacy settings" };

export default async function PrivacySettingsPage() {
  await requireSession();
  const graceDays = getEnv().ACCOUNT_DELETION_GRACE_DAYS;
  return (
    <div className="space-y-8">
      <PageHeader title="Settings" description={<SettingsNav current="privacy" />} />

      <Panel>
        <PanelHeader
          title="Your data"
          description={
            <>
              What we store, for how long, and who we share it with is on the{" "}
              <Link href="/privacy" className="text-accent underline underline-offset-4">
                privacy page
              </Link>
              .
            </>
          }
        />
        <PanelBody className="space-y-4 text-sm text-fg-muted">
          <p>
            The download has everything this account holds: your monitored addresses (in full), exposures,
            checklist progress, scans, risk scores, alerts, settings and your security log. Raw provider
            responses aren&apos;t included because we never store them.
          </p>
          <p>
            Treat the file like a password: it contains your email addresses. Each download is recorded in
            your security log.
          </p>
          <ExportDataButton />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Delete your account"
          description={`Deletion happens ${graceDays} days after you ask. Until then you can change your mind by signing in.`}
        />
        <PanelBody className="space-y-4">
          <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">
            <li>Right away: you&apos;re signed out everywhere, monitoring stops and no alerts are sent.</li>
            <li>
              After {graceDays} days: your account, monitored addresses, exposures, scans, alerts and settings
              are permanently deleted, and we email you to confirm.
            </li>
            <li>
              Our security log keeps that events happened, with nothing linking them to you. Backups expire
              within 35 days.
            </li>
          </ul>
          <DeleteAccountForm graceDays={graceDays} />
        </PanelBody>
      </Panel>
    </div>
  );
}
