import { expect, test } from "./fixtures";
import { AFTER_SUBMIT, expectAccessible, signUpAndVerify } from "./helpers";
import { uniqueEmail } from "./mailpit";

test.describe.configure({ mode: "default", timeout: 120_000 });

test("dashboard: honest before the first scan, explained after it", async ({ page }) => {
  await signUpAndVerify(page, uniqueEmail("dash"));
  await page.goto("/onboarding/identity");
  await page.getByRole("button", { name: "Use my sign-in email" }).click();
  await expect(page).toHaveURL(/\/onboarding\/scan$/, AFTER_SUBMIT);

  // Before any scan: no number, a clear next step.
  await page.goto("/app/dashboard");
  await expect(page.getByText("Not yet scored")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recommended actions" })).toBeVisible();
  await expect(page.getByText("Run your first scan")).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("button", { name: "Run first scan" }).click();
  await expect(page).toHaveURL(/\/app\/scans\/[0-9a-f]{24}$/, AFTER_SUBMIT);
  await expect(page.getByRole("heading", { level: 1, name: "Scan results" })).toBeVisible(AFTER_SUBMIT);

  await page.goto("/app/dashboard");
  const status = page.getByRole("region", { name: "Security status" });
  // A number, its direction, and the methodology disclaimer, always together (spec Part 9).
  await expect(status.locator("data").first()).toHaveText(/^\d{1,3}$/);
  await expect(status.getByText("Higher means more risk.")).toBeVisible();
  await expect(status.getByText(/not an industry-standard security score/)).toBeVisible();

  await status.getByText("Why this score?").click();
  await expect(status.getByText(/exposures?, weighted by how recent/).first()).toBeVisible();
  await expect(status.getByText(/Method risk-2026-10\.1/)).toBeVisible();

  await expect(
    page.getByRole("region", { name: "Active exposures" }).getByText(/^active exposures?$/),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recommended actions" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Monitoring" }).getByText(/Manual scans only/)).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Recent activity" }).getByText("Scan completed"),
  ).toBeVisible();
  await expect(page.getByText("Demo data").first()).toBeVisible();
  await expectAccessible(page);
});
