import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";

/**
 * Temporary, honest stand-in until authentication ships (Phase 3 replaces
 * both pages). The CTA lands somewhere truthful instead of a 404.
 */
export function AccountsNotOpen() {
  return (
    <div className="space-y-5">
      <Callout tone="info" title="Accounts aren't open yet.">
        Sign-up, email verification and sign-in are being built now. Nothing you could enter here would be
        stored.
      </Callout>
      <ButtonLink href="/#how-it-works" variant="secondary" className="w-full">
        See how it works
      </ButtonLink>
    </div>
  );
}
