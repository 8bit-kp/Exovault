import { test as base, expect, type Browser, type BrowserContext } from "@playwright/test";

/** A random documentation-range client IP, sent as X-Forwarded-For (see playwright.config TRUSTED_PROXY_COUNT). */
export function randomClientIp(): string {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  return `10.${octet()}.${octet()}.${octet()}`;
}

/** A second, independent browser (another device / an attacker) with its own client IP. */
export function newDeviceContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": randomClientIp() } });
}

export const PUBLIC_PAGES = [
  "/",
  "/how-it-works",
  "/security",
  "/privacy",
  "/about",
  "/auth/sign-up",
  "/auth/sign-in",
  "/auth/verify-email",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/design-system",
  "/design-system/app-shell",
  "/design-system/auth-shell",
] as const;

/** Routes that are linked (and therefore prefetched) but built in a later phase. */
const NOT_YET_BUILT: RegExp[] = [];

/**
 * Fails any test whose page logs a console error (which includes CSP
 * violations), throws, or gets an unexpected 4xx/5xx for a subresource. A strict
 * CSP that silently blocks the app's own scripts would otherwise go unnoticed.
 */
export const test = base.extend<{ consoleProblems: string[] }>({
  // Each test is its own client as far as per-IP rate limits are concerned.
  extraHTTPHeaders: async ({}, provide) => {
    await provide({ "x-forwarded-for": randomClientIp() });
  },
  consoleProblems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on("console", (message) => {
        // HTTP failures are tracked precisely below, with their URL.
        if (message.type() === "error" && !message.text().startsWith("Failed to load resource")) {
          problems.push(message.text());
        }
      });
      page.on("pageerror", (error) => problems.push(error.message));
      page.on("response", (response) => {
        const request = response.request();
        if (response.status() < 400) return;
        // Tests assert the status of the page they navigate to themselves.
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) return;
        const { pathname } = new URL(response.url());
        if (NOT_YET_BUILT.some((pattern) => pattern.test(pathname))) return;
        problems.push(`${response.status()} ${pathname}`);
      });
      await use(problems);
      expect(problems, "console errors, CSP violations, failed requests").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
