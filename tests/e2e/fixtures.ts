import { test as base, expect } from "@playwright/test";

export const PUBLIC_PAGES = [
  "/",
  "/auth/sign-up",
  "/auth/sign-in",
  "/design-system",
  "/design-system/app-shell",
  "/design-system/auth-shell",
] as const;

/**
 * Routes that are linked (and therefore prefetched) but built in a later phase.
 * Remove entries as the routes land; Phase 3 should empty this list.
 */
const NOT_YET_BUILT = [/^\/app(\/|$)/];

/**
 * Fails any test whose page logs a console error (which includes CSP
 * violations), throws, or gets an unexpected 4xx/5xx for a subresource. A strict
 * CSP that silently blocks the app's own scripts would otherwise go unnoticed.
 */
export const test = base.extend<{ consoleProblems: string[] }>({
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
