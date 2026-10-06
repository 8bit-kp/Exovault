import type { Metadata } from "next";
import Link from "next/link";
import { getEnv } from "@/config/env";
import { AddIdentityForm } from "@/components/identity/identity-forms";
import { IdentityCard } from "@/components/identity/identity-card";
import { PageHeader } from "@/components/layout/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { requireUser } from "@/lib/auth/session";
import { pluralize } from "@/lib/utils/format";
import { maskEmail } from "@/lib/utils/mask";
import { listIdentities } from "@/server/services/identity/identity-service";

export const metadata: Metadata = { title: "Identities" };

export default async function IdentitiesPage() {
  const user = await requireUser();
  const identities = await listIdentities(user.id);
  const max = getEnv().MAX_ACTIVE_IDENTITIES_PER_USER;
  const canAdd = identities.length < max;
  return (
    <div className="space-y-8">
      <PageHeader
        title="Identities"
        description={`The addresses we check for you. Your plan includes ${pluralize(max, "identity", "identities")}; addresses are stored encrypted and shown masked.`}
      />
      {identities.length > 0 ? (
        <ul className="grid gap-4 lg:grid-cols-2" aria-label="Your identities">
          {identities.map((identity) => (
            <li key={identity.id}>
              <IdentityCard
                identity={identity}
                action={
                  <ButtonLink href={`/app/identities/${identity.id}`} variant="secondary" size="sm">
                    {identity.verification === "pending" ? "Enter verification code" : "Manage"}
                  </ButtonLink>
                }
              />
            </li>
          ))}
        </ul>
      ) : null}
      {canAdd ? (
        <Panel>
          <PanelHeader title="Add an identity" description="Only addresses you can prove are yours." />
          <PanelBody>
            <AddIdentityForm flow="app" accountEmailMasked={maskEmail(user.email)} />
          </PanelBody>
        </Panel>
      ) : (
        <p className="text-sm text-fg-muted">
          You&apos;re using all {pluralize(max, "identity slot", "identity slots")}. To check a different
          address,{" "}
          <Link
            href={`/app/identities/${identities[0]?.id ?? ""}`}
            className="text-accent underline-offset-4 hover:underline"
          >
            remove the current one
          </Link>{" "}
          first.
        </p>
      )}
    </div>
  );
}
