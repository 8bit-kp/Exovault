import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/states";
import { Logo } from "@/components/ui/logo";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-8 px-4 py-16">
      <Logo />
      <EmptyState
        headingLevel="h1"
        title="Page not found"
        description="The page you asked for doesn't exist, or you don't have access to it."
        action={<ButtonLink href="/">Go to the home page</ButtonLink>}
        meta="404"
      />
    </main>
  );
}
