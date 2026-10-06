/**
 * Display masking for email addresses (spec 5.1): first and last character of
 * the local part, the domain kept so users recognise which address it is.
 * "kishan@example.com" → "k****n@example.com".
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "****";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const masked = local.length <= 2 ? `${local[0]}****` : `${local[0]}****${local[local.length - 1]}`;
  return `${masked}@${domain}`;
}
