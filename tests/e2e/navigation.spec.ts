import { expect, test } from "./fixtures";

test.describe("app shell navigation", () => {
  test("mobile drawer opens as a modal dialog, closes on Escape and restores focus", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "drawer is only rendered below the lg breakpoint");
    await page.goto("/design-system/app-shell");
    const trigger = page.getByRole("button", { name: "Open navigation" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Navigation" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Exposures" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("desktop sidebar shows every app section", async ({ page, isMobile }) => {
    test.skip(isMobile, "sidebar is hidden on small screens");
    await page.goto("/design-system/app-shell");
    const nav = page.getByRole("navigation", { name: "App" });
    for (const name of [
      "Dashboard",
      "Exposures",
      "Identities",
      "Monitoring",
      "Timeline",
      "Notifications",
      "Settings",
    ]) {
      await expect(nav.getByRole("link", { name })).toBeVisible();
    }
  });

  test("no horizontal scrolling at the current viewport", async ({ page }) => {
    for (const path of ["/", "/design-system", "/design-system/app-shell"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
