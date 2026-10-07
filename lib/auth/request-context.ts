import "server-only";
import { headers } from "next/headers";
import { getEnv } from "@/config/env";
import { clientIpFrom } from "@/lib/security/client-ip";
import type { RequestContext } from "@/server/services/account/auth-service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The proxy sets x-request-id, but requests it skips (prefetch-flagged) keep
 * whatever the client sent. Only a UUID is accepted; anything else gets a
 * fresh ID, so clients can't inject or inflate audit/log correlation IDs.
 */
export function trustedRequestId(value: string | null): string {
  return value && UUID.test(value) ? value : crypto.randomUUID();
}

/** Request context for Server Actions and Server Components. */
export async function getRequestContext(): Promise<RequestContext> {
  const incoming = await headers();
  return {
    headers: new Headers(incoming),
    ip: clientIpFrom(incoming, getEnv().TRUSTED_PROXY_COUNT),
    requestId: trustedRequestId(incoming.get("x-request-id")),
  };
}
