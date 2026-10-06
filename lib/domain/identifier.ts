import { z } from "zod";
import type { IdentifierType } from "./exposure";

/**
 * Identifier normalization (spec 5.1). The blind index is computed over the
 * normalized form, so two spellings of one address collide on purpose.
 *
 * Email: Unicode NFKC, trimmed, lower-cased. We deliberately do NOT strip dots
 * or "+tags": providers report breaches per literal address, and treating
 * a.b@gmail.com as ab@gmail.com is provider-specific and would let one
 * verification cover a different literal address.
 */
export function normalizeIdentifier(type: IdentifierType, raw: string): string {
  switch (type) {
    case "email":
      return raw.normalize("NFKC").trim().toLowerCase();
    case "phone":
    case "username":
      throw new Error(`${type} identifiers are not supported yet`);
  }
}

export const emailIdentifierSchema = z
  .string({ error: "Enter an email address." })
  .max(254, "Email addresses can't be longer than 254 characters.")
  .transform((value) => normalizeIdentifier("email", value))
  .pipe(z.email({ error: "Enter a valid email address." }));

/** Types the product accepts today (spec Part 3: email only in M1). */
export const SUPPORTED_IDENTIFIER_TYPES = ["email"] as const satisfies readonly IdentifierType[];

export const IDENTITY_STATUSES = ["active", "deleted"] as const;
export type IdentityStatus = (typeof IDENTITY_STATUSES)[number];

export const IDENTITY_VERIFICATION_STATES = ["pending", "verified"] as const;
export type IdentityVerificationState = (typeof IDENTITY_VERIFICATION_STATES)[number];
