/**
 * Open-redirect guard (spec 12.4). Only same-origin paths under an allow-listed
 * prefix survive; everything else falls back to the default.
 */
const ALLOWED_PREFIXES = ["/app", "/onboarding"] as const;
export const DEFAULT_AFTER_SIGN_IN = "/app/dashboard";

export function safeReturnTo(candidate: unknown, fallback: string = DEFAULT_AFTER_SIGN_IN): string {
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > 512) return fallback;
  // Must be a root-relative path: rejects "//evil.com", "/\\evil.com", "https://…", "javascript:…".
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(candidate)) return fallback;
  let url: URL;
  try {
    url = new URL(candidate, "http://exovault.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://exovault.invalid") return fallback;
  // Reject percent-encoded control characters (e.g. %0d%0a) as well as literal ones.
  try {
    if (/[\u0000-\u001f\u007f]/.test(decodeURIComponent(url.pathname + url.search))) return fallback;
  } catch {
    return fallback;
  }
  const allowed = ALLOWED_PREFIXES.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
  );
  if (!allowed) return fallback;
  // Normalised path (dot segments resolved) + query; fragments are dropped.
  return `${url.pathname}${url.search}`;
}
