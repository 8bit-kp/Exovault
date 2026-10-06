import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/(auth)/auth/actions";
import { Button } from "@/components/ui/button";

export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action={signOutAction} className={className}>
      <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
        <LogOut aria-hidden /> Sign out
      </Button>
    </form>
  );
}
