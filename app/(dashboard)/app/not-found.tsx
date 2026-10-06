import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";

/**
 * In-app 404, rendered inside the app shell (which owns <main>). Also what
 * another user's resource looks like: indistinguishable from one that doesn't
 * exist (spec 12.1).
 */
export default function AppNotFound() {
  return (
    <EmptyState
      headingLevel="h1"
      title="Not found"
      description="This doesn't exist, or it belongs to another account."
      action={<ButtonLink href="/app/dashboard">Back to dashboard</ButtonLink>}
    />
  );
}
