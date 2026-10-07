import type { Page } from "@playwright/test";
import { expect, newDeviceContext, test } from "./fixtures";
import { AFTER_SUBMIT, expectAccessible, signUpAndVerify } from "./helpers";
import { uniqueEmail } from "./mailpit";

test.describe.configure({ mode: "default", timeout: 120_000 });

/** Sign up, verify, use the sign-in email as the identity, start the first scan; ends on the live progress page. */
async function startFirstScan(page: Page, label: string) {
  await signUpAndVerify(page, uniqueEmail(label));
  await page.goto("/onboarding/identity");
  await page.getByRole("button", { name: "Use my sign-in email" }).click();
  await expect(page).toHaveURL(/\/onboarding\/scan$/, AFTER_SUBMIT);
  await page.getByRole("button", { name: "Start first scan" }).click();
  await expect(page).toHaveURL(/\/onboarding\/scan\?scan=[0-9a-f]{24}$/, AFTER_SUBMIT);
}

test("first scan: live progress from persisted state → results labelled as demo data → dashboard", async ({
  page,
}) => {
  await startFirstScan(page, "scan");
  await expect(page.getByRole("list", { name: "Scan steps" })).toBeVisible();
  await expect(page.getByText("Demo sources: results are fictional.")).toBeVisible();

  // The live region ends on the completion sentence once the server says it's done.
  await expect(page.getByRole("status").filter({ hasText: /Scan complete\./ })).toBeAttached(AFTER_SUBMIT);
  await page.getByRole("link", { name: "See results" }).click();

  await expect(page).toHaveURL(/\/onboarding\/results\?scan=[0-9a-f]{24}$/);
  await expect(page.getByRole("heading", { level: 1, name: /exposures found/ })).toBeVisible();
  await expect(page.getByText("Demo data").first()).toBeVisible();
  await expect(
    page.getByText(/Checked 2 sources \(Demo breach index, Demo credential watch\)/),
  ).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Exposures found" }).getByRole("listitem").first(),
  ).toBeVisible();
  // Fictional sources only.
  await expect(page.getByText(/\(fictional\)/).first()).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("link", { name: "Go to dashboard" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Recent exposures" })).toBeVisible();
  await expect(page.getByText(/You can scan again in about 1[45] minutes/)).toBeVisible();
  await expectAccessible(page);
});

test("clean address: honest 'not found in the sources checked', never 'safe'", async ({ page }) => {
  await startFirstScan(page, "clean");
  await page.getByRole("link", { name: "See results" }).click({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "No known exposures detected" })).toBeVisible();
  await expect(page.getByText(/Not found in the 2 sources checked on/)).toBeVisible();
  const text = (await page.locator("main").innerText()).toLowerCase();
  expect(text).not.toMatch(/you('| a)re safe|no risk|fully protected/);
});

test("partial scan: says results may be incomplete and offers a retry of only the failed source", async ({
  page,
}) => {
  await startFirstScan(page, "partial");
  await expect(page.getByText("1 of 2 sources responded. Results may be incomplete.")).toBeVisible(
    AFTER_SUBMIT,
  );
  const firstScanUrl = page.url();
  await page.getByRole("button", { name: "Retry failed source" }).first().click();
  await expect(page).not.toHaveURL(firstScanUrl, AFTER_SUBMIT);
  await expect(page).toHaveURL(/\/onboarding\/scan\?scan=[0-9a-f]{24}$/);
  // The retry covers just the failed source.
  await expect(page.getByText(/Sources · \d of 1 settled/)).toBeVisible();
});

test("scan progress endpoints require the owner's session", async ({ page, browser, request }) => {
  await startFirstScan(page, "sse-owner");
  const scanId = new URL(page.url()).searchParams.get("scan")!;

  const anonymous = await request.get(`/api/scans/${scanId}/events`);
  expect(anonymous.status()).toBe(401);

  const other = await newDeviceContext(browser);
  const otherPage = await other.newPage();
  await signUpAndVerify(otherPage, uniqueEmail("sse-other"));
  const foreign = await otherPage.request.get(`/api/scans/${scanId}`);
  expect(foreign.status()).toBe(404);
  const foreignStream = await otherPage.request.get(`/api/scans/${scanId}/events`);
  expect(foreignStream.status()).toBe(404);
  await other.close();

  const own = await page.request.get(`/api/scans/${scanId}`);
  expect(own.status()).toBe(200);
  const body = await own.json();
  // The scan view carries no identifier.
  expect(JSON.stringify(body)).not.toContain("example.test");
});
