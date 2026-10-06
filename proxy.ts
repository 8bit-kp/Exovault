import { NextResponse, type NextRequest } from "next/server";
import { buildContentSecurityPolicy, createNonce } from "@/lib/security/headers";

/**
 * Coarse edge concerns only (DECISIONS D-003): a per-request CSP nonce today,
 * and (Phase 3) a redirect away from /app/* when no session cookie exists.
 * Authorization is never decided here; every handler re-checks the session.
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildContentSecurityPolicy({ nonce, isDev: process.env.NODE_ENV === "development" });

  // Next.js reads the nonce from the request's CSP header during rendering and
  // stamps it on its own scripts and styles.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // HTML routes only: API responses, static assets, and prefetches don't execute inline scripts.
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
