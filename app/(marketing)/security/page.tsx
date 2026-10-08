import type { Metadata } from "next";
import { InfoPage, InfoSection, InfoTable } from "@/components/marketing/info-page";
import { brand } from "@/config/brand";
import { PASSWORD_MIN_LENGTH } from "@/lib/validation/auth";

export const metadata: Metadata = {
  title: "Security",
  description: `How ${brand.name} protects accounts and the addresses it monitors, and how to report a vulnerability.`,
};

export default function SecurityPage() {
  return (
    <InfoPage
      eyebrow="Security"
      title="How we protect your account and your data"
      intro="What's in place today, stated plainly, including what isn't built yet."
    >
      <InfoSection id="accounts" title="Accounts and sign-in">
        <InfoTable
          caption="Account security controls"
          head={["Control", "What it does"]}
          rows={[
            [
              "Passwords",
              `At least ${PASSWORD_MIN_LENGTH} characters, no composition rules (NIST 800-63B). Stored as a scrypt hash, never in clear. New passwords are checked against known breached passwords using k-anonymity: only the first 5 characters of a hash leave our server.`,
            ],
            [
              "Email verification",
              "Six-digit codes, stored hashed, valid for 10 minutes, single use. A code only works in the browser that signed up, or signed in with the password, so it can’t be used to take over an account someone else registered.",
            ],
            [
              "Sessions",
              "Last 7 days. Over HTTPS, cookies are HttpOnly, Secure, SameSite=Lax and host-only (__Host- prefix). You can see and sign out every session in settings, and resetting your password signs out all of them.",
            ],
            [
              "Rate limits",
              "Sign-in, sign-up, codes, resets, exports and other sensitive actions are limited per address, per account and per network. If the limiter is unavailable, those actions are refused rather than allowed.",
            ],
            [
              "No account enumeration",
              "Sign-up, sign-in and password reset respond the same way whether or not an account exists.",
            ],
            [
              "Two-factor sign-in",
              "Not available yet. The account system supports adding authenticator codes and passkeys later.",
            ],
          ]}
        />
      </InfoSection>

      <InfoSection id="data" title="The addresses you monitor">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Encrypted with AES-256-GCM before they reach the database. Keys are held outside the database and
            can be rotated.
          </li>
          <li>
            Duplicate checks use a keyed hash, not the address. Screens show a masked form (
            <span className="font-mono">k****n@example.com</span>); showing the full address takes a click,
            and each reveal is recorded in your security log.
          </li>
          <li>
            Decrypted only in memory, only while a source is being asked about it. Addresses never appear in
            URLs, logs, error messages or analytics.
          </li>
          <li>
            Provider responses are processed in memory and discarded; only the cleaned-up findings are kept.
          </li>
        </ul>
      </InfoSection>

      <InfoSection id="app" title="The application">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Every page and request checks who you are and that the data is yours. Someone else&apos;s record
            looks exactly like one that doesn&apos;t exist.
          </li>
          <li>
            A strict Content Security Policy with per-request nonces, and no inline scripts. Pages can&apos;t
            be framed.
          </li>
          <li>Forms and API calls that change data are protected against cross-site request forgery.</li>
          <li>
            An append-only security log of sign-ins, scans, reveals, exports and deletions, holding IDs and
            keyed hashes only, kept 12 months.
          </li>
          <li>
            Automated tests cover cross-account access, injection, rate limits, log leakage and encryption at
            rest.
          </li>
        </ul>
      </InfoSection>

      <InfoSection id="report" title="Report a vulnerability">
        <p>
          Email{" "}
          <a href={`mailto:${brand.supportEmail}`} className="text-accent underline underline-offset-4">
            {brand.supportEmail}
          </a>
          . Contact details are also published at{" "}
          <a href="/.well-known/security.txt" className="font-mono text-accent underline underline-offset-4">
            /.well-known/security.txt
          </a>
          . Please don&apos;t test against other people&apos;s accounts or run automated scans that degrade
          the service.
        </p>
        <p className="text-sm">
          {brand.name} is a portfolio project. These are the controls in its code, not a certification or a
          guarantee.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
