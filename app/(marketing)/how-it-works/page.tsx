import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage, InfoSection, Steps } from "@/components/marketing/info-page";
import { ButtonLink } from "@/components/ui/button";
import { brand } from "@/config/brand";
import { AUTH_ROUTES } from "@/config/navigation";

export const metadata: Metadata = {
  title: "How it works",
  description: `How ${brand.name} checks addresses you've verified against known breach sources, and what the results mean.`,
};

export default function HowItWorksPage() {
  return (
    <InfoPage
      eyebrow="How it works"
      title="From “am I exposed?” to “what do I do now?”"
      intro={
        <>
          {brand.name} asks documented breach-data providers about email addresses you&apos;ve proved you own,
          turns their answers into one list, explains how serious each finding is, and gives you a checklist.
        </>
      }
    >
      <InfoSection id="steps" title="What happens, step by step">
        <Steps
          items={[
            {
              title: "You create an account and confirm your sign-in email",
              body: "We send a six-digit code. It expires in 10 minutes and works once.",
            },
            {
              title: "You prove you own the address you want checked",
              body: "If it's your sign-in email, that's already done. Any other address gets its own code. Nothing is checked until the owner confirms, so nobody can use us to look up someone else.",
            },
            {
              title: "We ask the configured sources",
              body: "Each source is asked separately, with timeouts and retries. If one fails, you still see the others' results, and the scan says which one failed.",
            },
            {
              title: "Findings are cleaned up and merged",
              body: "The same breach reported by two sources becomes one finding. We keep the categories of data exposed (for example “password” or “phone number”), never the leaked values themselves.",
            },
            {
              title: "Each finding gets a severity, and you get a risk score",
              body: (
                <>
                  Severity depends on what was exposed: a readable password is critical, an email address
                  alone is low. The score (0–100) sums your open findings and goes down as you work through
                  them. It&apos;s our own measure, explained on the dashboard, not an industry standard.
                </>
              ),
            },
            {
              title: "You work through a checklist",
              body: "Concrete steps for each finding, such as changing that site's password or turning on two-factor sign-in. Progress is saved.",
            },
            {
              title: "Optionally, we keep checking",
              body: "Turn on monitoring and we re-check every 6, 12 or 24 hours, and email you when something new or more serious turns up. You choose the minimum severity, quiet hours, and instant or daily delivery.",
            },
          ]}
        />
      </InfoSection>

      <InfoSection id="results" title="Reading the results">
        <p>
          <strong>“Found”</strong> means a source we checked lists your address in that breach. It
          doesn&apos;t mean your account there was taken over.
        </p>
        <p>
          <strong>“Nothing found”</strong> means the sources we checked didn&apos;t list your address. It
          doesn&apos;t mean you&apos;re safe: no service sees every breach, and many are never made public.
        </p>
        <p>
          Every scan shows which sources answered, which failed, and when it ran. If a result is incomplete,
          it says so.
        </p>
      </InfoSection>

      <InfoSection id="sources" title="Where the data comes from">
        <p>
          In live mode, {brand.name} uses{" "}
          <a href="https://haveibeenpwned.com" className="text-accent underline underline-offset-4">
            Have I Been Pwned
          </a>
          &apos;s documented API, under its terms, and credits it wherever its data appears. The public demo
          runs on fictional sources instead, and every result from them is labelled “Demo data”.
        </p>
        <p>
          We don&apos;t crawl the dark web, scrape leak sites, or download breach dumps. What each source
          receives is listed on the{" "}
          <Link href="/privacy#processors" className="text-accent underline underline-offset-4">
            privacy page
          </Link>
          .
        </p>
      </InfoSection>

      <InfoSection id="start" title="Try it">
        <p>Checking starts with an account, because we only check addresses their owners have confirmed.</p>
        <ButtonLink href={AUTH_ROUTES.signUp}>Check your exposure</ButtonLink>
      </InfoSection>
    </InfoPage>
  );
}
