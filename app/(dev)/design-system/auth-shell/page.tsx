import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

/** Preview of the auth layout. The real forms arrive with Better Auth (Phase 3); this one submits nowhere. */
export default function AuthShellPreview() {
  return (
    <AuthShell
      title="Create your account"
      description="You'll verify your email next. We never look up an address you haven't verified."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/auth/sign-in" className="text-accent underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form className="space-y-4" action="#">
        <Field label="Email address">
          {({ id, describedBy }) => (
            <Input
              id={id}
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <Field label="Password" hint="At least 12 characters. A passphrase works well.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <Button type="button" className="w-full">
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
