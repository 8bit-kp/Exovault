import { expect, test } from "./fixtures";
import { AFTER_SUBMIT, expectAccessible, signUpAndVerify } from "./helpers";
import { uniqueEmail } from "./mailpit";

test.describe.configure({ mode: "default", timeout: 120_000 });

test("turn monitoring on and off; the dashboard shows the real schedule", async ({ page }) => {
  await signUpAndVerify(page, uniqueEmail("monitor"));
  await page.goto("/onboarding/identity");
  await page.getByRole("button", { name: "Use my sign-in email" }).click();
  await expect(page).toHaveURL(/\/onboarding\/scan$/, AFTER_SUBMIT);

  await page.goto("/app/monitoring");
  await expect(page.getByText(/Off\s*— Manual scans only/)).toBeVisible();
  await expectAccessible(page);

  await page.getByText("Every 12 hours").click();
  await page.getByRole("button", { name: "Turn on monitoring" }).click();
  await expect(page.getByText(/Active\s*— Scheduled scans are running/)).toBeVisible(AFTER_SUBMIT);
  // A concrete next-scan time, not "Not scheduled".
  await expect(page.locator("dd time").nth(0)).toBeVisible();
  await expect(page.getByText("Not scheduled")).toHaveCount(0);

  await page.goto("/app/dashboard");
  await expect(
    page.getByRole("region", { name: "Monitoring" }).getByText(/Scheduled scans are running/),
  ).toBeVisible();

  await page.goto("/app/monitoring");
  await page.getByRole("button", { name: "Turn off monitoring" }).click();
  await expect(page.getByText(/Off\s*— Manual scans only/)).toBeVisible(AFTER_SUBMIT);
});

test("timeline groups by month and filters server-side", async ({ page }) => {
  await signUpAndVerify(page, uniqueEmail("timeline"));
  await page.goto("/onboarding/identity");
  await page.getByRole("button", { name: "Use my sign-in email" }).click();
  await page.getByRole("button", { name: "Start first scan" }).click();
  // The scan runs in the BullMQ worker process.
  await expect(page.getByRole("link", { name: "See results" })).toBeVisible(AFTER_SUBMIT);

  await page.goto("/app/timeline");
  await expect(page.getByRole("heading", { level: 3, name: /\w+ \d{4}/ }).first()).toBeVisible();
  const total = Number((await page.getByText(/^\d+ exposures?\.$/).innerText()).match(/\d+/)![0]);
  expect(total).toBeGreaterThan(0);
  await expectAccessible(page);

  await page.getByLabel("Status").selectOption("remediated");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/status=remediated/);
  await expect(page.getByText(/match these filters/)).toBeVisible();

  // Junk in the URL is ignored, not trusted.
  await page.goto("/app/timeline?severity=%7B%22%24ne%22%3Anull%7D&page=-4");
  await expect(page.getByText(new RegExp(`^${total} exposures?\\.$`))).toBeVisible();
});
