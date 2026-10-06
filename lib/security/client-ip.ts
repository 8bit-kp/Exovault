/**
 * Client IP for rate limiting and coarse audit context (D-021).
 *
 * X-Forwarded-For is client-controlled unless a trusted proxy appends to it.
 * With `trustedProxyCount = n`, the n-th entry from the right is the address
 * our nearest trusted proxy saw. With 0 (direct connection) Next.js only fills
 * the header when the client didn't send one, so the value can be spoofed and
 * per-IP limits are best-effort; per-account limits still apply.
 */
export function clientIpFrom(headers: Headers, trustedProxyCount: number): string {
  const entries = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const index = entries.length - Math.max(1, trustedProxyCount);
  const candidate = entries[Math.max(0, index)] ?? headers.get("x-real-ip") ?? "";
  return isPlausibleIp(candidate) ? candidate : "unknown";
}

function isPlausibleIp(value: string): boolean {
  return value.length > 0 && value.length <= 45 && /^[0-9a-fA-F:.]+$/.test(value);
}
