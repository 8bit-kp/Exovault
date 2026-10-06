import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, createNonce, staticSecurityHeaders } from "@/lib/security/headers";

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(";").map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values] as const;
    }),
  );
}

describe("buildContentSecurityPolicy", () => {
  const nonce = createNonce();

  it("never allows inline script without the nonce, in any environment", () => {
    for (const isDev of [true, false]) {
      const csp = directives(buildContentSecurityPolicy({ nonce, isDev }));
      expect(csp.get("script-src")).toContain(`'nonce-${nonce}'`);
      expect(csp.get("script-src")).not.toContain("'unsafe-inline'");
    }
  });

  it("allows no inline style in production without the nonce", () => {
    const policy = buildContentSecurityPolicy({ nonce, isDev: false });
    expect(policy).not.toContain("'unsafe-inline'");
    expect(directives(policy).get("style-src")).toEqual(["'self'", `'nonce-${nonce}'`]);
  });

  it("relaxes styles in development only, without a nonce that would cancel the relaxation", () => {
    const style = directives(buildContentSecurityPolicy({ nonce, isDev: true })).get("style-src");
    expect(style).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("allows eval and the HMR websocket only in development", () => {
    const prod = directives(buildContentSecurityPolicy({ nonce, isDev: false }));
    const dev = directives(buildContentSecurityPolicy({ nonce, isDev: true }));
    expect(prod.get("script-src")).not.toContain("'unsafe-eval'");
    expect(prod.get("connect-src")).toEqual(["'self'"]);
    expect(dev.get("script-src")).toContain("'unsafe-eval'");
    expect(dev.get("connect-src")).toContain("ws:");
  });

  it("blocks framing, plugins, base-tag hijacking and cross-origin form posts", () => {
    const csp = directives(buildContentSecurityPolicy({ nonce, isDev: false }));
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.get("base-uri")).toEqual(["'none'"]);
    expect(csp.get("form-action")).toEqual(["'self'"]);
    expect(csp.has("upgrade-insecure-requests")).toBe(true);
  });

  it("rejects a nonce that could inject extra directives", () => {
    expect(() => buildContentSecurityPolicy({ nonce: "abc'; script-src *", isDev: false })).toThrow();
    expect(() => buildContentSecurityPolicy({ nonce: "short", isDev: false })).toThrow();
  });
});

describe("createNonce", () => {
  it("returns 128 bits of fresh base64 per call", () => {
    const nonces = new Set(Array.from({ length: 50 }, createNonce));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) {
      expect(Buffer.from(nonce, "base64")).toHaveLength(16);
    }
  });
});

describe("staticSecurityHeaders", () => {
  const asMap = (isProduction: boolean) =>
    new Map(staticSecurityHeaders({ isProduction }).map(({ key, value }) => [key, value]));

  it("sets the baseline headers in every environment", () => {
    const headers = asMap(false);
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
  });

  it("only sends HSTS in production, where TLS is guaranteed", () => {
    expect(asMap(false).has("Strict-Transport-Security")).toBe(false);
    expect(asMap(true).get("Strict-Transport-Security")).toMatch(/max-age=\d{8,}/);
  });
});
