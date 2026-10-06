"use client";

import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

/**
 * Route-level error boundary. Shows a safe message only: in production
 * `error.message` is replaced by Next.js, and we never render it anyway.
 * `digest` is a server log correlation ID, safe to show for support.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main" className="mx-auto max-w-xl px-4 py-16">
      <ErrorState
        headingLevel="h1"
        title="Something went wrong"
        description="This page couldn't be loaded. Your data hasn't changed. Try again, and if it keeps happening, come back later."
        action={
          <>
            <Button onClick={reset}>Try again</Button>
            <ButtonLink href="/" variant="secondary">
              Home
            </ButtonLink>
          </>
        }
        meta={error.digest ? `Reference: ${error.digest}` : undefined}
      />
    </main>
  );
}
