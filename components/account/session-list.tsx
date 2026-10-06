"use client";

import { Monitor } from "lucide-react";
import { useActionState } from "react";
import {
  revokeOtherSessionsAction,
  revokeSessionAction,
} from "@/app/(dashboard)/app/settings/security/actions";
import { FormMessage } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { IDLE } from "@/lib/validation/form-state";

export interface SessionRow {
  id: string;
  device: string;
  /** Pre-formatted on the server so client and server render identical text. */
  lastActive: string;
  lastActiveIso: string;
  current: boolean;
}

export function SessionList({ sessions }: { sessions: SessionRow[] }) {
  const [state, revoke, pending] = useActionState(revokeSessionAction, IDLE);
  const [othersState, revokeOthers, othersPending] = useActionState(revokeOtherSessionsAction, IDLE);
  const others = sessions.filter((s) => !s.current).length;

  return (
    <div className="space-y-4">
      <FormMessage state={state} />
      <FormMessage state={othersState} />
      <ul className="divide-y divide-line rounded-md border border-line">
        {sessions.map((session) => (
          <li key={session.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Monitor aria-hidden className="size-4 text-fg-subtle" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">
                {session.device}
                {session.current ? (
                  <span className="ml-2 text-xs font-normal text-ok">This device</span>
                ) : null}
              </p>
              <p className="text-xs text-fg-muted">
                Last active <time dateTime={session.lastActiveIso}>{session.lastActive}</time>
              </p>
            </div>
            {session.current ? null : (
              <form action={revoke}>
                <input type="hidden" name="sessionId" value={session.id} />
                <Button type="submit" variant="secondary" size="sm" disabled={pending}>
                  Sign out<span className="sr-only"> {session.device}</span>
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {others > 0 ? (
        <form action={revokeOthers}>
          <Button type="submit" variant="danger" size="sm" disabled={othersPending}>
            Sign out all other sessions
          </Button>
        </form>
      ) : null}
    </div>
  );
}
