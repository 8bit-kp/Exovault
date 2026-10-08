import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage, InfoSection } from "@/components/marketing/info-page";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "About",
  description: `What ${brand.name} is, who it's for, and what it isn't.`,
};

export default function AboutPage() {
  return (
    <InfoPage eyebrow="About" title={`About ${brand.name}`} intro={brand.tagline}>
      <InfoSection id="what" title="What it is">
        <p>
          {brand.name} helps one person answer a few questions about their email addresses: are they in known
          breaches, what was exposed, how serious it is, what to do about it, and whether anything has changed
          since the last check.
        </p>
        <p>
          It&apos;s built for individuals, not companies, and it only checks addresses their owners have
          confirmed.
        </p>
      </InfoSection>

      <InfoSection id="not" title="What it isn't">
        <ul className="list-disc space-y-2 pl-5">
          <li>Not a dark-web crawler. We use documented provider APIs under their terms, nothing else.</li>
          <li>
            Not complete. It reports what its configured sources know, and no source knows every breach.
          </li>
          <li>
            Not a guarantee. “Nothing found” means “not found in the sources we checked”, never “you&apos;re
            safe”.
          </li>
        </ul>
      </InfoSection>

      <InfoSection id="project" title="The project">
        <p>
          {brand.name} is a portfolio project, built to show how a security product handles personal data
          carefully: encrypted identifiers, ownership checks before any lookup, explainable scores, honest
          states, and tests for the ways it could be abused. The public version runs on fictional demo data.
        </p>
        <p>
          Read{" "}
          <Link href="/how-it-works" className="text-accent underline underline-offset-4">
            how it works
          </Link>
          ,{" "}
          <Link href="/security" className="text-accent underline underline-offset-4">
            how it&apos;s secured
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-accent underline underline-offset-4">
            what it stores
          </Link>
          . Questions or security reports:{" "}
          <a href={`mailto:${brand.supportEmail}`} className="text-accent underline underline-offset-4">
            {brand.supportEmail}
          </a>
          .
        </p>
      </InfoSection>
    </InfoPage>
  );
}
