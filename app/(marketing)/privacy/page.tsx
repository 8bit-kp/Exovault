import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage, InfoSection, InfoTable } from "@/components/marketing/info-page";
import { brand } from "@/config/brand";
import { getEnv } from "@/config/env";

export const metadata: Metadata = {
  title: "Privacy",
  description: `What ${brand.name} stores, for how long, who receives it, and how to export or delete it.`,
};

export default function PrivacyPage() {
  const graceDays = getEnv().ACCOUNT_DELETION_GRACE_DAYS;
  return (
    <InfoPage
      eyebrow="Privacy"
      title="What we store, and what we don't"
      intro={
        <>
          A breach-monitoring service has to handle your email addresses. Here is exactly how {brand.name}{" "}
          does it. This describes a portfolio project and is not legal advice.
        </>
      }
    >
      <InfoSection id="stored" title="What we store">
        <InfoTable
          caption="Data we store"
          head={["Data", "How", "Kept for"]}
          rows={[
            [
              "Your sign-in email",
              "In clear: we need it to sign you in and email you",
              "Life of the account",
            ],
            ["Your password", "scrypt hash only", "Life of the account"],
            [
              "Addresses you monitor",
              "AES-256-GCM encrypted; a keyed hash for duplicate checks; a masked copy for display",
              "Until you remove them",
            ],
            [
              "Findings",
              "Source name, date, the categories of data exposed and our assessment, never the leaked values",
              "Until you remove the address",
            ],
            ["Scan records", "When, which sources answered, counts", "12 months"],
            [
              "Alerts",
              "Which finding, when it was sent; email content is built at send time and not kept",
              "90 days",
            ],
            [
              "Security log",
              "Events with IDs and keyed hashes of email and IP addresses, never the values",
              "12 months; unlinked from you when your account is deleted",
            ],
            ["Sessions", "Random token, expiry, browser type; no IP address", "7 days"],
          ]}
        />
      </InfoSection>

      <InfoSection id="not-stored" title="What we never store">
        <ul className="list-disc space-y-2 pl-5">
          <li>Your password in clear, or any password you type anywhere else.</li>
          <li>Raw responses from breach providers, or copies of breach datasets.</li>
          <li>Leaked passwords, card numbers or other leaked values.</li>
          <li>Your IP address in clear.</li>
          <li>
            Email addresses in URLs, logs or analytics. We don&apos;t use analytics or tracking pixels at all.
          </li>
        </ul>
      </InfoSection>

      <InfoSection id="processors" title="Who receives your data">
        <p>
          Checking an address means telling a provider which address to look up. These are the only third
          parties involved:
        </p>
        <InfoTable
          caption="Third parties"
          head={["Who", "What they receive", "When"]}
          rows={[
            [
              <a
                key="hibp"
                href="https://haveibeenpwned.com"
                className="text-accent underline underline-offset-4"
              >
                Have I Been Pwned
              </a>,
              "The monitored email address, over HTTPS",
              "Each scan, in live mode only (the public demo uses fictional sources)",
            ],
            [
              "Pwned Passwords",
              "The first 5 characters of a hash of your new password (k-anonymity), never the password",
              "When you set a password",
            ],
            [
              "Our email provider",
              "Your sign-in email and the message",
              "Codes, account notices and alerts you've turned on",
            ],
          ]}
        />
      </InfoSection>

      <InfoSection id="rights" title="Your data, your choice">
        <p>
          <strong>Download it.</strong> Settings → Privacy gives you everything this account holds as a JSON
          file, including the addresses you monitor in full.
        </p>
        <p>
          <strong>Delete it.</strong> Settings → Privacy, after re-entering your password. You&apos;re signed
          out everywhere and monitoring stops at once; {graceDays} days later the account and everything in it
          is permanently deleted and we email you to confirm. Sign in before then to keep it. Backups roll off
          within 35 days.
        </p>
        <p>
          <strong>Remove one address.</strong> Removing a monitored address deletes it and its findings
          immediately.
        </p>
      </InfoSection>

      <InfoSection id="legal" title="Legal basis">
        <p>
          We process account data to provide the service you sign up for (GDPR Art. 6(1)(b); under
          India&apos;s DPDP Act 2023, consent given at sign-up for that purpose). Security logging relies on
          legitimate interest in keeping the service and its users safe. Export and deletion above are how we
          meet access, portability and erasure requests.
        </p>
        <p className="text-sm">
          The technical detail behind this page is in the project&apos;s documentation. See also{" "}
          <Link href="/security" className="text-accent underline underline-offset-4">
            Security
          </Link>
          .
        </p>
      </InfoSection>
    </InfoPage>
  );
}
