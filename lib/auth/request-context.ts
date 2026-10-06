import "server-only";
import { headers } from "next/headers";
import { getEnv } from "@/config/env";
import { clientIpFrom } from "@/lib/security/client-ip";
import type { RequestContext } from "@/server/services/account/auth-service";

/** Request context for Server Actions and Server Components. */
export async function getRequestContext(): Promise<RequestContext> {
  const incoming = await headers();
  return {
    headers: new Headers(incoming),
    ip: clientIpFrom(incoming, getEnv().TRUSTED_PROXY_COUNT),
    requestId: incoming.get("x-request-id"),
  };
}
