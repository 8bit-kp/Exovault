import { expect, newDeviceContext, test } from "./fixtures";
import { AFTER_SUBMIT, expectAccessible, signUpAndVerify, signUpToDashboard } from "./helpers";
import { codeFrom, uniqueEmail, waitForEmail } from "./mailpit";

test.describe.configure({ mode: "default", timeout: 120_000 });

test("onboarding: use the sign-in email → verified without a second code → dashboard shows it", async ({
  page,
}) => {
  const email = uniqueEmail("onboard");
  await signUpAndVerify(page, email);
  await expectAccessible(page);

  await page.getByRole("link", { name: "Get started" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Which address should we check?" })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole("button", { name: "Use my sign-in email" }).click();
  await expect(page).toHaveURL(/\/onboarding\/scan$/, AFTER_SUBMIT);
  await expect(page.getByRole("heading", { name: "Ready for your first scan" })).toBeVisible();
  await expectAccessible(page);

  await page.goto("/app/dashboard");
  await expect(
    page
      .locator("main")
      .getByText(/^e\*\*\*\*.*@example\.test$/)
      .first(),
  ).toBeVisible();
  await expect(page.getByText("Verified").first()).toBeVisible();
});

test("a different address needs the emailed code; the code works once; the limit is enforced", async ({
  page,
}) => {
  await signUpToDashboard(page, uniqueEmail("other"));
  const other = uniqueEmail("second-inbox");

  await page.goto("/app/identities");
  await page.getByLabel("A different email address").fill(other);
  await page.getByRole("button", { name: "Send verification code" }).click();
  await expect(page).toHaveURL(/\/app\/identities\/[0-9a-f]{24}$/, AFTER_SUBMIT);
  // The address never appears in our URLs (spec 5.1).
  expect(page.url()).not.toContain("example.test");
  await expectAccessible(page);

  const message = await waitForEmail(other, "Confirm Exovault can check this address");
  await page.getByLabel("Verification code").fill(codeFrom(message));
  await page.getByRole("button", { name: "Verify address" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Verified identity" })).toBeVisible(AFTER_SUBMIT);

  // E2E allows 2 identities; the third add is refused.
  await page.goto("/app/identities");
  await page.getByRole("button", { name: "Use my sign-in email" }).click();
  await expect(page).toHaveURL(/\/app\/identities\/[0-9a-f]{24}$/, AFTER_SUBMIT);
  await page.goto("/app/identities");
  await expect(page.getByText(/You're using all 2 identity slots/)).toBeVisible();
});

test("reveal shows the full address on demand only; remove asks for confirmation", async ({ page }) => {
  const email = uniqueEmail("reveal");
  await signUpAndVerify(page, email);
  await page.goto("/onboarding/identity");
  await page.getByRole("button", { name: "Use my sign-in email" }).click();
  await expect(page).toHaveURL(/\/onboarding\/scan$/, AFTER_SUBMIT);

  await page.goto("/app/identities");
  await page.getByRole("link", { name: "Manage" }).click();
  await expect(page).toHaveURL(/\/app\/identities\/[0-9a-f]{24}$/);
  await expect(page.getByText(email)).toHaveCount(0);
  await page.getByRole("button", { name: "Reveal full address" }).click();
  await expect(page.getByText(email)).toBeVisible();
  await page.getByRole("button", { name: "Hide" }).click();
  await expect(page.getByText(email)).toHaveCount(0);

  await page.getByRole("button", { name: "Remove identity" }).click();
  const dialog = page.getByRole("dialog", { name: "Remove this identity?" });
  await expect(dialog).toBeVisible();
  await expectAccessible(page);
  await dialog.getByRole("button", { name: "Remove" }).click();
  await expect(page).toHaveURL(/\/app\/identities$/, AFTER_SUBMIT);
  await expect(page.getByRole("list", { name: "Your identities" })).toHaveCount(0);
});

test("another user's identity URL reveals nothing: same not-found page as a missing one", async ({
  page,
  browser,
}) => {
  await signUpAndVerify(page, uniqueEmail("victim"));
  await page.goto("/onboarding/identity");
  await page.getByRole("button", { name: "Use my sign-in email" }).click();
  await expect(page).toHaveURL(/\/onboarding\/scan$/, AFTER_SUBMIT);
  await page.goto("/app/identities");
  await page.getByRole("link", { name: "Manage" }).click();
  await expect(page).toHaveURL(/\/app\/identities\/[0-9a-f]{24}$/);
  const victimUrl = page.url();
  const victimMasked = (await page.locator("main .font-mono").first().innerText()).trim();

  const attacker = await newDeviceContext(browser);
  const attackerPage = await attacker.newPage();
  await signUpAndVerify(attackerPage, uniqueEmail("attacker"));
  await attackerPage.goto(victimUrl);
  // Streaming responses can't switch to a 404 status mid-stream (Next.js "soft 404", D-025);
  // what matters is that the content is the generic not-found page and nothing of the victim's.
  await expect(attackerPage.getByRole("heading", { level: 1, name: "Not found" })).toBeVisible();
  await expect(attackerPage.locator("main").getByText(victimMasked)).toHaveCount(0);
  // A streamed not-found page can carry the robots tag twice (layout + not-found); every copy must say noindex.
  const robots = await attackerPage
    .locator('meta[name="robots"]')
    .evaluateAll((tags) => tags.map((t) => t.getAttribute("content") ?? ""));
  expect(robots.length).toBeGreaterThan(0);
  for (const content of robots) expect(content).toMatch(/noindex/);
  await expectAccessible(attackerPage);

  // Identical to an ID that doesn't exist at all.
  await attackerPage.goto("/app/identities/0123456789abcdef01234567");
  await expect(attackerPage.getByRole("heading", { level: 1, name: "Not found" })).toBeVisible();
  await attacker.close();
});
