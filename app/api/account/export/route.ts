import { getEnv } from "@/config/env";
import { trustedRequestId } from "@/lib/auth/request-context";
import { getSession } from "@/lib/auth/session";
import { json, unauthorized } from "@/lib/http/responses";
import { isSameOriginRequest } from "@/lib/security/origin";
import { exportAccountData } from "@/server/services/account/data-export-service";

/**
 * Data export (spec 5.2). POST, not GET: it decrypts identifiers and writes an
 * audit event, so it must not be triggerable by a cross-site link or image.
 * Route Handlers get no CSRF protection from Next.js, hence the Origin check.
 */
export async function POST(request: Request) {
  if (!isSameOriginRequest(request, getEnv().APP_URL)) return json({ error: "forbidden" }, 403);
  const session = await getSession();
  if (!session) return unauthorized();
  const result = await exportAccountData(session.user, {
    requestId: trustedRequestId(request.headers.get("x-request-id")),
  });
  if (!result.ok) {
    return result.reason === "rate_limited"
      ? json({ error: "rate_limited" }, 429)
      : json({ error: "unavailable" }, 503);
  }
  return new Response(result.body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${result.filename}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
