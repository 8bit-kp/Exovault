/**
 * Security headers (spec 12.4, DECISIONS D-007 / D-014). Pure functions so the
 * policy is unit-tested; `proxy.ts` and `next.config.ts` only apply them.
 *
 * Must stay free of Node-only and server-only imports: it runs in the proxy.
 */

export interface CspOptions {
  nonce: string;
  isDev: boolean;
}

/**
 * Strict, nonce-based CSP. In production there is no 'unsafe-inline' and no
 * 'unsafe-eval', so inline `style` attributes are blocked in server-rendered
 * HTML; components use classes and SVG attributes instead.
 *
 * Development-only relaxations (D-014): 'unsafe-eval' (React dev error stacks),
 * the HMR websocket, and 'unsafe-inline' styles, because Turbopack's CSS hot
 * reload injects <style> tags without a nonce. Browsers ignore 'unsafe-inline'
 * when a nonce is present, so the dev style-src carries no nonce.
 */
export function buildContentSecurityPolicy({ nonce, isDev }: CspOptions): string {
  if (!/^[A-Za-z0-9+/=_-]{16,}$/.test(nonce)) {
    throw new Error("CSP nonce must be at least 16 base64 characters");
  }
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": isDev ? ["'self'", "'unsafe-inline'"] : ["'self'", `'nonce-${nonce}'`],
    "img-src": ["'self'", "blob:", "data:"],
    "font-src": ["'self'"],
    // Dev needs the HMR websocket. Production talks only to its own origin.
    "connect-src": ["'self'", ...(isDev ? ["ws:"] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'none'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "frame-src": ["'none'"],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!isDev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

/** A fresh 128-bit nonce, base64-encoded. Web Crypto works in every runtime. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export interface StaticHeaderOptions {
  isProduction: boolean;
}

/** Headers that don't vary per request; applied to every response via next.config. */
export function staticSecurityHeaders({
  isProduction,
}: StaticHeaderOptions): Array<{ key: string; value: string }> {
  const headers = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    {
      key: "Permissions-Policy",
      value: [
        "accelerometer=()",
        "camera=()",
        "geolocation=()",
        "gyroscope=()",
        "magnetometer=()",
        "microphone=()",
        "payment=()",
        "usb=()",
        "interest-cohort=()",
        "browsing-topics=()",
      ].join(", "),
    },
  ];
  if (isProduction) {
    // Two years, subdomains included. Preload is a deployment decision (docs/DEPLOYMENT.md).
    headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
  }
  return headers;
}
