import { readFile } from "node:fs/promises";
import { expect, test } from "./fixtures";
import { AFTER_SUBMIT, expectAccessible, PASSWORD, signUpAndVerify } from "./helpers";
import { uniqueEmail, waitForEmail } from "./mailpit";

test.describe.configure({ timeout: 120_000 });

async function withIdentity(page: import("@playwright/test").Page, email: string) {
  await signUpAndVerify(page, email);
  await page.goto("/onboarding/identity");
  await page.getByRole("button", { name: "Use my sign-in email" }).click();
  await expect(page).toHaveURL(/\/onboarding\/scan$/, AFTER_SUBMIT);
}

test("download my data: a JSON file with my own data; refused cross-site and signed out", async ({
  page,
  playwright,
  baseURL,
}) => {
  const email = uniqueEmail("export");
  await withIdentity(page, email);
  await page.goto("/app/settings/privacy");
  await expectAccessible(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download my data (JSON)" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^exovault-export-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(data.account.email).toBe(email);
  expect(data.identities[0].value).toBe(email);
  expect(JSON.stringify(data)).not.toContain("ciphertext");

  // CSRF (spec 4.2): a cookie-carrying POST from another origin is refused before anything runs.
  const forged = await page.request.post("/api/account/export", {
    headers: { origin: "https://evil.example" },
  });
  expect(forged.status()).toBe(403);

  const anonymous = await playwright.request.newContext({ baseURL });
  expect((await anonymous.post("/api/account/export", { headers: { origin: baseURL! } })).status()).toBe(401);
  await anonymous.dispose();
});

test("delete my account: password re-entry, signed out, restorable by signing in during the grace period", async ({
  page,
}) => {
  const email = uniqueEmail("delete");
  await withIdentity(page, email);
  await page.goto("/app/settings/privacy");

  // Wrong password: nothing happens.
  await page.getByLabel("Your password").fill("not my password at all");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByText("That password isn't right.")).toBeVisible(AFTER_SUBMIT);

  // A failed submit resets the form (React 19), so the confirmation is ticked again.
  await page.getByLabel("Your password").fill(PASSWORD);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in\?deleted=1$/, AFTER_SUBMIT);
  await expect(page.getByText("Your account is scheduled for deletion.")).toBeVisible();
  const notice = await waitForEmail(email, "scheduled for deletion");
  expect(notice).toContain("Sign in before that date");

  // Signed out: the app is closed to this browser.
  await page.goto("/app/dashboard");
  await expect(page).toHaveURL(/\/auth\/sign-in/);

  // Signing in during the grace period leads only to the restore page.
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/auth\/account-deletion$/, AFTER_SUBMIT);
  await expect(page.getByRole("heading", { name: "Your account is scheduled for deletion" })).toBeVisible();
  await expectAccessible(page);
  await page.goto("/app/monitoring");
  await expect(page).toHaveURL(/\/auth\/account-deletion$/);

  await page.getByRole("button", { name: "Keep my account" }).click();
  await expect(page).toHaveURL(/\/app\/dashboard\?restored=1$/, AFTER_SUBMIT);
  await expect(page.getByText("Your account is no longer scheduled for deletion.")).toBeVisible();
  await page.goto("/app/monitoring");
  await expect(page).toHaveURL(/\/app\/monitoring$/);
});
