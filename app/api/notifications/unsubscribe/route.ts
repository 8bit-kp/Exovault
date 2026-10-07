import { getEnv } from "@/config/env";
import { json } from "@/lib/http/responses";
import { clientIpFrom } from "@/lib/security/client-ip";
import { unsubscribeWithToken } from "@/server/services/notification/notification-service";

/**
 * RFC 8058 one-click unsubscribe. Mail clients POST here cross-site with no
 * cookies; the sealed, purpose-bound token is the only authority, and all it
 * can do is turn alert emails off. No Origin check (D-033): there is no
 * session to ride on, and the action is harmless if replayed.
 */
export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? undefined;
  const ip = clientIpFrom(request.headers, getEnv().TRUSTED_PROXY_COUNT);
  return (await unsubscribeWithToken(token, ip)) ? json({ ok: true }) : json({ error: "invalid_token" }, 400);
}
