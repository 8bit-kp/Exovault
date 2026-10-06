import { z } from "zod";
import type { IdentifierType } from "./exposure";

/**
 * Identifier normalization (spec 7.4). The blind index and provider lookups use
 * the normalized form, so two spellings of one address collide on purpose.
 *
 * Email rules, each unit-tested:
 *  1. trim surrounding whitespace;
 *  2. Unicode NFC (canonical composition only: NFKC would fold distinct
 *     compatibility characters into one address);
 *  3. split on the last "@"; both parts must be non-empty;
 *  4. lower-case the domain and convert it to ASCII (IDNA / punycode);
 *  5. lower-case the local part. RFC 5321 allows case-sensitive local parts,
 *     but no major provider treats them so; this is the standard practical choice;
 *  6. never strip dots or "+tags": they can be distinct mailboxes, so folding
 *     them would cause false matches;
 *  7. reject malformed input instead of "fixing" it (returns null).
 */
const LOCAL_PART = /^[^\s@"(),:;<>[\]\\]{1,64}$/u;
const ASCII_DOMAIN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

export function normalizeEmail(raw: string): string | null {
  const value = raw.trim().normalize("NFC");
  const at = value.lastIndexOf("@");
  if (at <= 0 || at === value.length - 1) return null;
  const local = value.slice(0, at).toLowerCase();
  const domainInput = value.slice(at + 1).toLowerCase();
  if (!LOCAL_PART.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes(".."))
    return null;
  if (/[\s/?#@:\\[\]]/.test(domainInput)) return null;
  let domain: string;
  try {
    // WHATWG URL host parsing performs IDNA ToASCII in browsers and Node alike.
    domain = new URL(`http://${domainInput}`).hostname;
  } catch {
    return null;
  }
  if (!ASCII_DOMAIN.test(domain)) return null;
  const normalized = `${local}@${domain}`;
  return normalized.length <= 254 ? normalized : null;
}

export function normalizeIdentifier(type: IdentifierType, raw: string): string {
  switch (type) {
    case "email": {
      const normalized = normalizeEmail(raw);
      if (normalized === null) throw new Error("Malformed email address");
      return normalized;
    }
    case "phone":
    case "username":
      throw new Error(`${type} identifiers are not supported yet`);
  }
}

export const emailIdentifierSchema = z
  .string({ error: "Enter an email address." })
  .max(320, "Email addresses can't be longer than 254 characters.")
  .transform((value, ctx) => {
    const normalized = normalizeEmail(value);
    if (normalized === null) {
      ctx.addIssue({ code: "custom", message: "Enter a valid email address." });
      return z.NEVER;
    }
    return normalized;
  });

/** Types the product accepts today (spec Part 3: email only in M1). */
export const SUPPORTED_IDENTIFIER_TYPES = ["email"] as const satisfies readonly IdentifierType[];

export const IDENTITY_STATUSES = ["active", "deleted"] as const;
export type IdentityStatus = (typeof IDENTITY_STATUSES)[number];

export const IDENTITY_VERIFICATION_STATES = ["pending", "verified"] as const;
export type IdentityVerificationState = (typeof IDENTITY_VERIFICATION_STATES)[number];
