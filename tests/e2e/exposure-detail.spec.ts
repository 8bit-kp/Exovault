import type { Page } from "@playwright/test";
import { expect, newDeviceContext, test } from "./fixtures";
import { AFTER_SUBMIT, expectAccessible, signUpAndVerify } from "./helpers";
import { uniqueEmail } from "./mailpit";

test.describe.configure({ mode: "default", timeout: 120_000 });

async function scannedAccount(page: Page, label: string) {
  await signUpAndVerify(page, uniqueEmail(label));
  await page.goto("/onboarding/identity");
  await page.getByRole("button", { name: "Use my sign-in email" }).click();
  await expect(page).toHaveURL(/\/onboarding\/scan$/, AFTER_SUBMIT);
  await page.getByRole("button", { name: "Start first scan" }).click();
  await expect(page.getByRole("link", { name: "See results" })).toBeVisible(AFTER_SUBMIT);
}

async function currentScore(page: Page): Promise<number> {
  await page.goto("/app/dashboard");
  const text = await page
    .getByRole("region", { name: "Security status" })
    .locator("data")
    .first()
    .innerText();
  return Number(text);
}

test("open an exposure, work through the checklist, and watch the score fall", async ({ page }) => {
  await scannedAccount(page, "sensitive-detail");
  const before = await currentScore(page);

  await page.goto("/app/exposures");
  await page.getByRole("link", { name: "Northwind Rewards (fictional)" }).click();
  await expect(page).toHaveURL(/\/app\/exposures\/[0-9a-f]{24}$/);
  await expect(page.getByRole("heading", { level: 1, name: "Northwind Rewards (fictional)" })).toBeVisible();
  for (const name of ["What to do", "Why it matters", "What happened", "What was exposed"]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }
  await expect(page.getByText(/doesn't prove it wasn't exposed/)).toBeVisible();
  await expectAccessible(page);

  const checklist = page.getByRole("group", { name: /What to do now/ });
  // Users click the row's label (the native checkbox is visually hidden behind it).
  await checklist.getByText("Change the password for this account").click();
  await expect(page.getByText("In progress", { exact: true })).toBeVisible(AFTER_SUBMIT);
  await expect(page.getByText(/^1 of \d+ done$/)).toBeVisible();

  // Progress survives a reload.
  await page.reload();
  await expect(
    checklist.getByRole("checkbox", { name: "Change the password for this account" }),
  ).toBeChecked();

  await page.getByRole("button", { name: "Mark as fixed" }).click();
  await expect(page.getByText("Remediated", { exact: true })).toBeVisible(AFTER_SUBMIT);
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();

  expect(await currentScore(page)).toBeLessThan(before);
});

test("sensitive sources stay hidden until revealed; dismissing needs a reason", async ({ page }) => {
  await scannedAccount(page, "sensitive-reveal");
  await page.goto("/app/exposures");
  // Not named anywhere in the list.
  await expect(page.getByText("Luna Dating (fictional)")).toHaveCount(0);
  await page.getByRole("link", { name: "Sensitive source (hidden)" }).click();
  await expect(page).toHaveURL(/\/app\/exposures\/[0-9a-f]{24}$/);
  // Not in the page title either.
  expect(await page.title()).not.toContain("Luna");
  await expect(page.getByText("Luna Dating (fictional)")).toHaveCount(0);

  await page.getByRole("button", { name: "Reveal source name" }).click();
  await expect(page.getByText("Luna Dating (fictional)")).toBeVisible();

  await page.getByLabel("Dismiss because…").selectOption("not_my_account");
  await page.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByText("Dismissed: I never had an account there")).toBeVisible(AFTER_SUBMIT);
  await expectAccessible(page);
});

test("another user's exposure URL shows the generic not-found page", async ({ page, browser }) => {
  await scannedAccount(page, "victim-exposure");
  await page.goto("/app/exposures");
  await page
    .getByRole("link")
    .filter({ hasText: /\(fictional\)|Sensitive/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/app\/exposures\/[0-9a-f]{24}$/);
  const url = page.url();

  const attacker = await newDeviceContext(browser);
  const attackerPage = await attacker.newPage();
  await signUpAndVerify(attackerPage, uniqueEmail("attacker-exposure"));
  await attackerPage.goto(url);
  await expect(attackerPage.getByRole("heading", { level: 1, name: "Not found" })).toBeVisible();
  await expect(attackerPage.getByText(/\(fictional\)/)).toHaveCount(0);
  await attacker.close();
});
