import AxeBuilder from "@axe-core/playwright";
import { PUBLIC_PAGES, expect, test } from "./fixtures";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe("axe (WCAG 2.2 AA, including colour contrast)", () => {
  for (const path of [...PUBLIC_PAGES, "/this-page-does-not-exist"]) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await page.locator("main#main").waitFor();
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      const summary = results.violations.map(
        (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
      );
      expect(summary).toEqual([]);
    });
  }
});

test("unknown routes render the 404 state with a real 404 status", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
});

test("the skip link is the first tab stop and moves focus to main content", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium");
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});
