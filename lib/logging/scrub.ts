/**
 * Scrubs identifiers out of free-text log messages from third-party libraries
 * (Better Auth logs e.g. "Sign-up attempt for existing email: <address>").
 * Structured fields are covered by the logger's key-based redaction; this is
 * the safety net for strings we don't control.
 */
const EMAIL = /[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+\.[^\s@<>"'(),;:]+/g;
const BEARER = /\b(Bearer|token[=:])\s*[A-Za-z0-9._~+/-]{8,}=*/gi;

const MAX_LENGTH = 2_000;

export function scrubMessage(message: string): string {
  // Bound the input: the patterns are linear-ish, but there's no reason to scan megabytes.
  return message.slice(0, MAX_LENGTH).replace(EMAIL, "[email]").replace(BEARER, "$1 [redacted]");
}
