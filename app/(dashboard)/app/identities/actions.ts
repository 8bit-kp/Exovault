"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actorFrom } from "@/lib/auth/actor";
import { getRequestContext } from "@/lib/auth/request-context";
import { requireSession } from "@/lib/auth/session";
import type { FormState } from "@/lib/validation/form-state";
import {
  addEmailIdentity,
  removeIdentity,
  resendIdentityCode,
  revealIdentity,
  verifyIdentityCode,
} from "@/server/services/identity/identity-service";

/*
 * Identity Server Actions: session first, then the service, which scopes
 * every lookup by the session's user ID. Client-supplied identity IDs are
 * never trusted beyond "which of *my* identities".
 */

const flowSchema = z.enum(["onboarding", "app"]).catch("app");

function rateLimited(retryAfterSeconds: number): FormState {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return {
    status: "error",
    message: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
  };
}

const UNAVAILABLE: FormState = {
  status: "error",
  message: "This is temporarily unavailable. Please try again shortly.",
};
const GENERIC: FormState = {
  status: "error",
  message: "Something went wrong on our side. Please try again.",
};
const NOT_FOUND: FormState = { status: "error", message: "That identity wasn't found." };

async function context() {
  const { ip, requestId } = await getRequestContext();
  return { ip, requestId };
}

export async function addIdentityAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const flow = flowSchema.parse(formData.get("flow"));
  const value = formData.get("useAccountEmail") === "1" ? session.user.email : formData.get("email");
  const result = await addEmailIdentity(actorFrom(session), value, await context());
  if (!result.ok) {
    const echo = { email: typeof value === "string" ? value : "" };
    switch (result.reason) {
      case "invalid":
        return { status: "error", fieldErrors: { email: result.message }, values: echo };
      case "duplicate":
        return {
          status: "error",
          fieldErrors: { email: "You've already added this address." },
          values: echo,
        };
      case "limit_reached":
        return {
          status: "error",
          message:
            "You've reached the number of identities your account can monitor. Remove one to add another.",
        };
      case "rate_limited":
        return rateLimited(result.retryAfterSeconds);
      case "unavailable":
        return UNAVAILABLE;
      default:
        return GENERIC;
    }
  }
  revalidatePath("/app", "layout");
  if (flow === "onboarding")
    redirect(result.verification === "verified" ? "/onboarding/scan" : "/onboarding/identity");
  redirect(`/app/identities/${result.identityId}`);
}

export async function verifyIdentityAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const flow = flowSchema.parse(formData.get("flow"));
  const identityId = String(formData.get("identityId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code))
    return { status: "error", fieldErrors: { code: "Enter the 6-digit code from the email." } };

  const result = await verifyIdentityCode(actorFrom(session), identityId, code, await context());
  if (!result.ok) {
    switch (result.reason) {
      case "invalid":
        return {
          status: "error",
          fieldErrors: { code: "That code isn't right. Check the latest email and try again." },
        };
      case "expired":
        return {
          status: "error",
          message: "That code has expired or been tried too many times. Send a new one.",
        };
      case "already_verified":
        break;
      case "rate_limited":
        return rateLimited(result.retryAfterSeconds);
      case "unavailable":
        return UNAVAILABLE;
      default:
        return NOT_FOUND;
    }
  }
  revalidatePath("/app", "layout");
  redirect(flow === "onboarding" ? "/onboarding/scan" : `/app/identities/${identityId}`);
}

export async function resendIdentityCodeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const result = await resendIdentityCode(
    actorFrom(session),
    String(formData.get("identityId") ?? ""),
    await context(),
  );
  if (result.ok) return { status: "success", message: "We sent a new code. It replaces any earlier one." };
  switch (result.reason) {
    case "rate_limited":
      return rateLimited(result.retryAfterSeconds);
    case "unavailable":
      return UNAVAILABLE;
    case "already_verified":
      return { status: "success", message: "This address is already verified." };
    case "not_found":
      return NOT_FOUND;
    default:
      return GENERIC;
  }
}

export interface RevealState {
  status: "idle" | "revealed" | "error";
  value?: string;
}

export async function revealIdentityAction(_prev: RevealState, formData: FormData): Promise<RevealState> {
  const session = await requireSession();
  const result = await revealIdentity(
    actorFrom(session),
    String(formData.get("identityId") ?? ""),
    await context(),
  );
  return result.ok ? { status: "revealed", value: result.value } : { status: "error" };
}

export async function removeIdentityAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const result = await removeIdentity(
    actorFrom(session),
    String(formData.get("identityId") ?? ""),
    await context(),
  );
  if (!result.ok) return NOT_FOUND;
  revalidatePath("/app", "layout");
  redirect("/app/identities");
}
