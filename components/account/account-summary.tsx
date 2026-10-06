import { maskEmail } from "@/lib/utils/mask";
import { SignOutButton } from "./sign-out-button";

/** Sidebar footer / top-bar account block. Shows the masked email only (spec 5.1). */
export function AccountSummary({ email, compact = false }: { email: string; compact?: boolean }) {
  if (compact) return <SignOutButton />;
  return (
    <div className="space-y-2">
      <p className="px-3 text-xs text-fg-subtle">
        Signed in as <span className="block truncate font-mono text-fg-muted">{maskEmail(email)}</span>
      </p>
      <SignOutButton />
    </div>
  );
}
