import { describe, expect, it } from "vitest";
import { clientIpFrom } from "@/lib/security/client-ip";
import { isSameOriginRequest } from "@/lib/security/origin";
import { DEFAULT_AFTER_SIGN_IN, safeReturnTo } from "@/lib/security/redirect";

describe("safeReturnTo (open-redirect guard)", () => {
  it.each(["/app/dashboard", "/app/exposures/abc?tab=details", "/onboarding/identity", "/app"])(
    "keeps allow-listed internal path %s",
    (path) => expect(safeReturnTo(path)).toBe(path),
  );

  it.each([
    "https://evil.example/app",
    "//evil.example/app",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "/auth/sign-in",
    "/app-evil",
    "/app/../auth/sign-in",
    "/app/%0d%0aSet-Cookie:x",
    "app/dashboard",
    "",
    "/app/\u0000",
    "/" + "a".repeat(600),
  ])("rejects %s", (path) => {
    expect(safeReturnTo(path)).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it("rejects non-strings", () => {
    expect(safeReturnTo(["/app"])).toBe(DEFAULT_AFTER_SIGN_IN);
    expect(safeReturnTo(undefined)).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it("drops fragments and normalizes dot segments inside the allowed area", () => {
    expect(safeReturnTo("/app/./exposures#x")).toBe("/app/exposures");
  });
});

describe("isSameOriginRequest (CSRF)", () => {
  const app = "https://exovault.example";
  const post = (headers: Record<string, string>) => new Request(`${app}/api/x`, { method: "POST", headers });

  it("allows safe methods without checks", () => {
    expect(isSameOriginRequest(new Request(`${app}/api/x`), app)).toBe(true);
  });

  it("accepts a matching Origin and rejects any other", () => {
    expect(isSameOriginRequest(post({ origin: app }), app)).toBe(true);
    expect(isSameOriginRequest(post({ origin: "https://evil.example" }), app)).toBe(false);
    expect(isSameOriginRequest(post({ origin: "null" }), app)).toBe(false);
  });

  it("falls back to Sec-Fetch-Site, then Referer, and refuses when all are missing", () => {
    expect(isSameOriginRequest(post({ "sec-fetch-site": "same-origin" }), app)).toBe(true);
    expect(isSameOriginRequest(post({ "sec-fetch-site": "cross-site" }), app)).toBe(false);
    expect(isSameOriginRequest(post({ referer: `${app}/app/settings` }), app)).toBe(true);
    expect(isSameOriginRequest(post({ referer: "https://exovault.example.evil.io/" }), app)).toBe(false);
    expect(isSameOriginRequest(post({}), app)).toBe(false);
  });
});

describe("clientIpFrom", () => {
  const h = (xff: string) => new Headers({ "x-forwarded-for": xff });

  it("uses the entry appended by the nearest trusted proxy", () => {
    expect(clientIpFrom(h("6.6.6.6, 203.0.113.9"), 1)).toBe("203.0.113.9");
    expect(clientIpFrom(h("6.6.6.6, 203.0.113.9, 10.0.0.2"), 2)).toBe("203.0.113.9");
  });

  it("falls back to the only entry with no proxies, and rejects junk", () => {
    expect(clientIpFrom(h("198.51.100.4"), 0)).toBe("198.51.100.4");
    expect(clientIpFrom(h("<script>"), 0)).toBe("unknown");
    expect(clientIpFrom(new Headers(), 0)).toBe("unknown");
  });
});
