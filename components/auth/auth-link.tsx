import Link from "next/link";
import type { ReactNode } from "react";

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-accent underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
