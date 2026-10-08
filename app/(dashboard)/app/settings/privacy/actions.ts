"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { AUTH_ROUTES } from "@/config/navigation";
import { getRequestContext } from "@/lib/auth/request-context";
import { requireSession } from "@/lib/auth/session";
import type { FormState } from "@/lib/validation/form-state";
import { requestAccountDeletion } from "@/server/services/account/account-deletion-service";
import { signOut } from "@/server/services/account/auth-service";

const deletionSchema = z.object({
  password: z.string().min(1, "Enter your password.").max(128),
  confirm: z.literal("on", { error: "Tick the box to confirm." }),
});

/** Spec 5.2: confirmation + re-authentication, then a grace period (not an immediate delete). */
export async function requestDeletionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await requireSession();
  const parsed = deletionSchema.safeParse({
    password: formData.get("password") ?? "",
    confirm: formData.get("confirm") ?? undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { status: "error", fieldErrors };
  }
  const ctx = await getRequestContext();
  const result = await requestAccountDeletion(user, parsed.data.password, ctx);
  if (!result.ok) {
    switch (result.reason) {
      case "invalid_password":
        return { status: "error", fieldErrors: { password: "That password isn't right." } };
      case "rate_limited":
        return { status: "error", message: "Too many attempts. Try again in 15 minutes." };
      default:
        return { status: "error", message: "This is temporarily unavailable. Please try again shortly." };
    }
  }
  // Every session was revoked server-side; this clears the cookie in this browser too.
  await signOut(ctx, user.id).catch(() => undefined);
  redirect(`${AUTH_ROUTES.signIn}?deleted=1`);
}
