import { z } from "zod";

/**
 * Auth input schemas, shared by forms (client hints) and Server Actions (the
 * real check). Password policy follows NIST SP 800-63B: length over
 * composition rules, a generous maximum, breached-password screening (server
 * side, D-019), and no forced rotation.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z
  .string({ error: "Enter your email address." })
  .trim()
  .min(1, "Enter your email address.")
  .max(254, "Email addresses can't be longer than 254 characters.")
  .pipe(z.email({ error: "Enter a valid email address." }))
  .transform((value) => value.toLowerCase());

export const newPasswordSchema = z
  .string({ error: "Choose a password." })
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Use ${PASSWORD_MAX_LENGTH} characters or fewer.`);

/** Sign-in only checks shape; policy is enforced when a password is set. */
const existingPasswordSchema = z
  .string({ error: "Enter your password." })
  .min(1, "Enter your password.")
  .max(PASSWORD_MAX_LENGTH);

export const signUpSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  returnTo: z.string().max(512).optional(),
});

export const signInSchema = z.object({
  email: emailSchema,
  password: existingPasswordSchema,
  returnTo: z.string().max(512).optional(),
});

export const emailOnlySchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(16).max(512),
    password: newPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords don't match.",
  });

/** Field errors keyed by input name, first message only. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    result[key] ??= issue.message;
  }
  return result;
}
