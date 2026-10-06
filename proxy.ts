import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieConfig } from "@/lib/auth/cookies";
import { buildContentSecurityPolicy, createNonce } from "@/lib/security/headers";

/**
 * Coarse edge concerns only (DECISIONS D-003): a request ID, a per-request CSP
 * nonce, and a redirect away from /app/* when there is no session cookie at
 * all. The cookie is only checked for presence; whether it's valid is
 * decided by every page and action via getSession().
 */
export function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const { pathname, search } = request.nextUrl;

  if (pathname === "/app" || pathname.startsWith("/app/")) {
    const cookieName = sessionCookieConfig(process.env.APP_URL ?? "http://localhost:3000").sessionTokenName;
    if (!request.cookies.has(cookieName)) {
      const signIn = new URL("/auth/sign-in", request.url);
      signIn.searchParams.set("returnTo", `${pathname}${search}`);
      const redirect = NextResponse.redirect(signIn);
      redirect.headers.set("x-request-id", requestId);
      return redirect;
    }
  }

  const nonce = createNonce();
  const csp = buildContentSecurityPolicy({ nonce, isDev: process.env.NODE_ENV === "development" });

  // Next.js reads the nonce from the request's CSP header during rendering and
  // stamps it on its own scripts and styles.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: [
    {
      // HTML routes and Server Action POSTs. API responses, static assets, and prefetches are skipped.
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
