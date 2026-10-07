import { getSession } from "@/lib/auth/session";
import { json, notFound, unauthorized } from "@/lib/http/responses";
import { getScanForUser } from "@/server/services/scan/scan-service";

/** Current persisted scan state: the polling fallback when SSE isn't available. */
export async function GET(_request: Request, { params }: RouteContext<"/api/scans/[id]">) {
  const session = await getSession();
  if (!session) return unauthorized();
  const scan = await getScanForUser(session.user.id, (await params).id);
  return scan ? json(scan) : notFound();
}
