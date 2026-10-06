import { expect, test } from "./fixtures";

test.describe("landing page", () => {
  test("leads with the product promise and a single sign-up CTA (no anonymous lookup)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /Know what is exposed\.\s*Know what to do next\./,
    );
    const ctas = page.getByRole("link", { name: /check your exposure/i });
    await expect(ctas.first()).toHaveAttribute("href", "/auth/sign-up");
    // Spec 2.3: there must be no email input anywhere on the public page.
    await expect(page.locator("input")).toHaveCount(0);
  });

  test("labels every illustrative result as an example", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("region", { name: "Example status readout" }).getByText("Example", { exact: true }),
    ).toBeVisible();
    await expect(page.locator("#example").getByText("Example", { exact: true })).toBeVisible();
  });

  test("states limitations and makes no prohibited claims (spec 1.3)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#limitations")).toContainText("not found in the sources we checked");
    const text = (await page.locator("body").innerText()).toLowerCase();
    for (const claim of [
      "monitors the entire dark web",
      "detects every breach",
      "100% protection",
      "guaranteed security",
      "you're safe",
      "continuous monitoring is active",
    ]) {
      expect(text).not.toContain(claim);
    }
  });
});
