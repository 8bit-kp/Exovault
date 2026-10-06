"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getRequestContext } from "@/lib/auth/request-context";
import { requireSession } from "@/lib/auth/session";
import type { FormState } from "@/lib/validation/form-state";
import { revokeOtherSessions, revokeSession } from "@/server/services/account/session-service";

const sessionIdSchema = z.string().regex(/^[0-9a-f]{24}$/);

export async function revokeSessionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const parsed = sessionIdSchema.safeParse(formData.get("sessionId"));
  // Same response for malformed, missing, and someone else's session ID.
  if (!parsed.success || parsed.data === session.session.id) {
    return { status: "error", message: "That session couldn't be signed out." };
  }
  const revoked = await revokeSession(session.user.id, parsed.data, await getRequestContext());
  revalidatePath("/app/settings/security");
  return revoked
    ? { status: "success", message: "Signed out that session." }
    : { status: "error", message: "That session couldn't be signed out." };
}

export async function revokeOtherSessionsAction(): Promise<FormState> {
  const session = await requireSession();
  const count = await revokeOtherSessions(session.user.id, session.session.id, await getRequestContext());
  revalidatePath("/app/settings/security");
  return {
    status: "success",
    message:
      count === 0
        ? "No other sessions were signed in."
        : `Signed out ${count} other session${count === 1 ? "" : "s"}.`,
  };
}
