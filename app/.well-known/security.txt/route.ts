import { brand } from "@/config/brand";
import { getEnv } from "@/config/env";

/**
 * RFC 9116 security.txt (spec 12.4). Expires is required and must be within a
 * year; it's computed at request time so it never goes stale.
 */
export function GET() {
  const expires = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
  expires.setUTCHours(0, 0, 0, 0);
  const body = [
    `Contact: mailto:${brand.supportEmail}`,
    `Expires: ${expires.toISOString()}`,
    "Preferred-Languages: en",
    `Canonical: ${getEnv().APP_URL}/.well-known/security.txt`,
    `Policy: ${getEnv().APP_URL}/#limitations`,
    "",
  ].join("\n");
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=86400" },
  });
}
