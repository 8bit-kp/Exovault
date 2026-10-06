import { PUBLIC_PAGES, expect, test } from "./fixtures";

test.describe("security headers on the running app", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} sends a nonce-based CSP that its own scripts satisfy`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      const csp = response!.headers()["content-security-policy"];
      expect(csp).toBeTruthy();
      expect(csp).not.toContain("'unsafe-inline'");
      expect(csp).not.toContain("'unsafe-eval'");
      expect(csp).toContain("frame-ancestors 'none'");

      const nonce = /'nonce-([^']+)'/.exec(csp)![1];
      // Every script Next rendered carries this request's nonce.
      const scriptNonces = await page
        .locator("script")
        .evaluateAll((nodes) => nodes.map((node) => (node as HTMLScriptElement).nonce));
      expect(scriptNonces.length).toBeGreaterThan(0);
      for (const value of scriptNonces) expect(value).toBe(nonce);

      // The page hydrated (client JS ran under the CSP): the console fixture also
      // fails the test on any "Refused to execute/apply" violation.
      await expect(page.locator("main#main")).toBeVisible();
    });
  }

  test("issues a fresh nonce per request", async ({ request }) => {
    const nonceOf = async () =>
      /'nonce-([^']+)'/.exec((await request.get("/")).headers()["content-security-policy"])![1];
    expect(await nonceOf()).not.toBe(await nonceOf());
  });

  test("sends the static hardening headers and hides the framework", async ({ request }) => {
    const headers = (await request.get("/")).headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["strict-transport-security"]).toContain("max-age=");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});
