"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { AUTH_ROUTES } from "@/config/navigation";
import {
  clearPendingVerification,
  getPendingVerification,
  setPendingVerification,
} from "@/lib/auth/pending-verification";
import { getRequestContext } from "@/lib/auth/request-context";
import { getSession } from "@/lib/auth/session";
import { safeReturnTo } from "@/lib/security/redirect";
import {
  emailOnlySchema,
  fieldErrors,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation/auth";
import type { FormState } from "@/lib/validation/form-state";
import * as account from "@/server/services/account/auth-service";
import type { AuthResult } from "@/server/services/account/auth-service";

/*
 * Thin Server Actions: parse → validate → service → map to a safe FormState
 * or redirect. Next.js checks Origin against Host for every action (CSRF).
 */

const GENERIC_ERROR = "Something went wrong on our side. Please try again.";

function failure(
  result: Exclude<AuthResult<string>, { ok: true }>,
  overrides: Partial<Record<string, string>> = {},
): FormState {
  switch (result.reason) {
    case "rate_limited": {
      const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60));
      return {
        status: "error",
        message: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      };
    }
    case "unavailable":
      return {
        status: "error",
        message: "This is temporarily unavailable. Please try again in a few minutes.",
      };
    default:
      return { status: "error", message: overrides[result.reason] ?? GENERIC_ERROR };
  }
}

function fromForm(formData: FormData, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.map((key) => [key, formData.get(key) ?? undefined]));
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signUpSchema.safeParse(fromForm(formData, ["email", "password"]));
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: fieldErrors(parsed.error),
      values: { email: String(formData.get("email") ?? "") },
    };
  }
  const result = await account.signUp(parsed.data, await getRequestContext());
  if (!result.ok) {
    if (result.reason === "compromised_password") {
      return {
        status: "error",
        fieldErrors: {
          password:
            "This password appears in a known data breach. Choose a different one; a long passphrase works well.",
        },
        values: { email: parsed.data.email },
      };
    }
    return { ...failure(result), values: { email: parsed.data.email } };
  }
  await setPendingVerification(parsed.data.email, result.nonce ?? null);
  redirect(AUTH_ROUTES.verifyEmail);
}

export async function signInAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse(fromForm(formData, ["email", "password", "returnTo"]));
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: fieldErrors(parsed.error),
      values: { email: String(formData.get("email") ?? "") },
    };
  }
  const result = await account.signIn(parsed.data, await getRequestContext());
  if (!result.ok) {
    return {
      ...failure(result, { invalid: "Email or password is incorrect." }),
      values: { email: parsed.data.email },
    };
  }
  if (result.next === "verify-email") {
    await setPendingVerification(parsed.data.email, result.nonce ?? null);
    redirect(AUTH_ROUTES.verifyEmail);
  }
  redirect(safeReturnTo(parsed.data.returnTo));
}

const codeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from the email."),
});

export async function verifyEmailAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const pending = await getPendingVerification();
  if (!pending)
    return { status: "error", message: "This verification session expired. Sign in to get a new code." };
  const parsed = codeSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const result = await account.verifyEmailCode(
    { email: pending.email, code: parsed.data.code, nonce: pending.nonce },
    await getRequestContext(),
  );
  if (!result.ok) {
    return failure(result, {
      invalid: "That code isn't right. Check the latest email and try again.",
      expired: "That code has expired or been used too many times. Send a new one.",
    });
  }
  await clearPendingVerification();
  // First sign-in after sign-up: continue into onboarding (spec 13.2).
  redirect("/onboarding");
}

export async function resendCodeAction(): Promise<FormState> {
  const pending = await getPendingVerification();
  if (!pending)
    return { status: "error", message: "This verification session expired. Sign in to get a new code." };
  const result = await account.resendVerificationCode(pending, await getRequestContext());
  if (!result.ok) return failure(result);
  await setPendingVerification(pending.email, pending.nonce); // Extend the window alongside the new code.
  return { status: "success", message: "We sent a new code. It replaces any earlier one." };
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailOnlySchema.safeParse(fromForm(formData, ["email"]));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  const result = await account.requestPasswordReset(parsed.data, await getRequestContext());
  if (!result.ok) return failure(result);
  // Same message whether or not the account exists.
  return {
    status: "success",
    message: "If an account uses that address, we've emailed a reset link. It expires in 30 minutes.",
  };
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse(fromForm(formData, ["token", "password", "confirmPassword"]));
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    if (errors.token) return { status: "error", message: "This reset link is invalid. Request a new one." };
    return { status: "error", fieldErrors: errors };
  }
  const result = await account.resetPassword(parsed.data, await getRequestContext());
  if (!result.ok) {
    if (result.reason === "compromised_password") {
      return {
        status: "error",
        fieldErrors: { password: "This password appears in a known data breach. Choose a different one." },
      };
    }
    return failure(result, {
      expired: "This reset link has expired or was already used. Request a new one.",
    });
  }
  redirect(`${AUTH_ROUTES.signIn}?reset=1`);
}

export async function signOutAction(): Promise<void> {
  const session = await getSession();
  await clearPendingVerification();
  await account.signOut(await getRequestContext(), session?.user.id ?? null);
  redirect("/");
}
