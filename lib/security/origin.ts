/**
 * CSRF defence for cookie-authenticated Route Handlers (spec 4.2). Server
 * Actions get this from Next.js and Better Auth checks its own endpoints; our
 * own mutating route handlers must call `isSameOriginRequest` first.
 */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSameOriginRequest(request: Request, appUrl: string): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return true;
  const expected = new URL(appUrl).origin;
  const origin = request.headers.get("origin");
  if (origin) return origin === expected;
  // No Origin header: fall back to Sec-Fetch-Site, then Referer. Absent all three, refuse.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite === "same-origin";
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === expected;
  } catch {
    return false;
  }
}
