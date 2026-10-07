import { expect, test } from "./fixtures";
import { AFTER_SUBMIT, expectAccessible, signUpAndVerify } from "./helpers";
import { uniqueEmail } from "./mailpit";

test.describe.configure({ mode: "default", timeout: 120_000 });

test("notification settings save and persist; inbox explains itself", async ({ page }) => {
  await signUpAndVerify(page, uniqueEmail("prefs"));

  await page.goto("/app/notifications");
  await expect(page.getByRole("heading", { name: "No alerts yet" })).toBeVisible();
  await expectAccessible(page);

  await page.goto("/app/settings/notifications");
  await expect(page.getByLabel("Email me when monitoring finds something")).toBeChecked();
  await page.getByLabel("Minimum severity").selectOption("high");
  await page.getByLabel("One daily summary (08:00 your time)").check();
  await page.getByLabel("Hold alerts during these hours and send them afterwards").check();
  await page.getByLabel("Your timezone").selectOption("Asia/Kolkata");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.locator("main [role=status]")).toHaveText(/Notification settings saved\./, AFTER_SUBMIT);
  await expectAccessible(page);

  await page.reload();
  await expect(page.getByLabel("Minimum severity")).toHaveValue("high");
  await expect(page.getByLabel("One daily summary (08:00 your time)")).toBeChecked();
  await expect(page.getByLabel("Your timezone")).toHaveValue("Asia/Kolkata");
});

test("unsubscribe links: confirmation page never acts on GET; bad tokens are refused", async ({
  page,
  request,
}) => {
  await page.goto("/notifications/unsubscribe?token=forged");
  await expect(page.getByRole("heading", { name: "Stop exposure alert emails?" })).toBeVisible();
  await page.getByRole("button", { name: "Turn off alert emails" }).click();
  await expect(page.locator("main [role=alert]")).toContainText("invalid or has expired");
  await expectAccessible(page);

  const oneClick = await request.post("/api/notifications/unsubscribe?token=forged", {
    form: { "List-Unsubscribe": "One-Click" },
  });
  expect(oneClick.status()).toBe(400);
});
