import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, newDeviceContext, test } from "./fixtures";
import { codeFrom, uniqueEmail, waitForEmail } from "./mailpit";

const PASSWORD = "a long and memorable passphrase";

// Password hashing makes these flows CPU-heavy: run this file's tests in order on one worker.
test.describe.configure({ mode: "default", timeout: 120_000 });

/** Navigation after a Server Action that hashes a password; generous for loaded CI/dev machines. */
const AFTER_SUBMIT = { timeout: 30_000 };

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
  ).toEqual([]);
}

async function signUpAndVerify(page: Page, email: string) {
  await page.goto("/auth/sign-up");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/auth\/verify-email$/, AFTER_SUBMIT);
  // The address is masked on screen and never appears in the URL.
  await expect(page.getByText(/e\*\*\*\*/)).toBeVisible();
  expect(page.url()).not.toContain("example.test");

  const code = codeFrom(await waitForEmail(email, "verification code"));
  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page).toHaveURL(/\/app\/dashboard$/, AFTER_SUBMIT);
}

test.describe("account journey", () => {
  test("sign up → verify with emailed code → dashboard → sign out → sign in", async ({ page, context }) => {
    const email = uniqueEmail("journey");
    await signUpAndVerify(page, email);

    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    // Honest M1 state.
    await expect(page.getByText(/Manual scans only/)).toBeVisible();
    await expect(page.getByText("Not yet scored")).toBeVisible();
    await expectAccessible(page);

    // The session cookie is HttpOnly and SameSite=Lax.
    const sessionCookie = (await context.cookies()).find((c) => c.name.endsWith("session_token"));
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.sameSite).toBe("Lax");

    await page.goto("/app/settings/security");
    await expect(page.getByText("This device")).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("button", { name: "Sign out" }).first().click();
    await expect(page).toHaveURL(/\/$/, AFTER_SUBMIT);
    await page.goto("/app/dashboard");
    await expect(page).toHaveURL(/\/auth\/sign-in\?returnTo=%2Fapp%2Fdashboard$/, AFTER_SUBMIT);

    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/app\/dashboard$/, AFTER_SUBMIT);
  });

  test("a stolen cookie stops working after sign-out (server-side invalidation)", async ({
    page,
    context,
    browser,
  }) => {
    await signUpAndVerify(page, uniqueEmail("revoke"));
    const cookies = await context.cookies();

    await page.getByRole("button", { name: "Sign out" }).first().click();
    await expect(page).toHaveURL(/\/$/, AFTER_SUBMIT);

    // Replay the old cookie in a fresh browser context.
    const attacker = await newDeviceContext(browser);
    await attacker.addCookies(cookies);
    const attackerPage = await attacker.newPage();
    await attackerPage.goto("/app/dashboard");
    await expect(attackerPage).toHaveURL(/\/auth\/sign-in/, AFTER_SUBMIT);
    await attacker.close();
  });

  test("wrong password and unknown account get the identical message", async ({ page }) => {
    await page.goto("/auth/sign-in");
    await page.getByLabel("Email address").fill(uniqueEmail("nobody"));
    await page.getByLabel("Password", { exact: true }).fill("definitely wrong password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("main [role=alert]")).toHaveText(/Email or password is incorrect\./);
  });

  test("signing up with an existing address looks the same as a new sign-up", async ({ page, browser }) => {
    const email = uniqueEmail("dupe");
    await signUpAndVerify(page, email);

    const other = await newDeviceContext(browser);
    const otherPage = await other.newPage();
    await otherPage.goto("/auth/sign-up");
    await otherPage.getByLabel("Email address").fill(email);
    await otherPage.getByLabel("Password", { exact: true }).fill("another long passphrase here");
    await otherPage.getByRole("button", { name: "Create account" }).click();
    await expect(otherPage).toHaveURL(/\/auth\/verify-email$/, AFTER_SUBMIT);
    // The real owner is told instead.
    await waitForEmail(email, "Your Exovault account");
    await other.close();
  });

  test("password reset: link → new password → old sessions revoked → sign in with new password", async ({
    page,
    browser,
  }) => {
    const email = uniqueEmail("reset");
    await signUpAndVerify(page, email);

    const other = await newDeviceContext(browser);
    const otherPage = await other.newPage();
    await otherPage.goto("/auth/forgot-password");
    await otherPage.getByLabel("Email address").fill(email);
    await otherPage.getByRole("button", { name: "Send reset link" }).click();
    await expect(otherPage.locator("main [role=status]")).toContainText("If an account uses that address");

    const link = (await waitForEmail(email, "Reset your")).match(
      /https?:\/\/\S+reset-password\?token=\S+/,
    )?.[0];
    expect(link).toBeTruthy();
    await otherPage.goto(link!);
    await otherPage.getByLabel("New password", { exact: true }).fill("a brand new passphrase");
    await otherPage.getByLabel("Confirm new password").fill("a brand new passphrase");
    await otherPage.getByRole("button", { name: "Set new password" }).click();
    await expect(otherPage).toHaveURL(/\/auth\/sign-in\?reset=1$/, AFTER_SUBMIT);

    // The first browser's session was revoked by the reset.
    await page.goto("/app/dashboard");
    await expect(page).toHaveURL(/\/auth\/sign-in/, AFTER_SUBMIT);

    await otherPage.getByLabel("Email address").fill(email);
    await otherPage.getByLabel("Password", { exact: true }).fill("a brand new passphrase");
    await otherPage.getByRole("button", { name: "Sign in" }).click();
    await expect(otherPage).toHaveURL(/\/app\/dashboard$/, AFTER_SUBMIT);
    await other.close();
  });
});

test("the 6th sign-in attempt from one client within 15 minutes is refused", async ({ page }) => {
  await page.goto("/auth/sign-in");
  for (let attempt = 1; attempt <= 6; attempt++) {
    await page.getByLabel("Email address").fill(`guess${attempt}@example.test`);
    await page.getByLabel("Password", { exact: true }).fill("wrong password attempt");
    // Wait for this attempt's Server Action round-trip; the previous alert text would otherwise match early.
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/auth/sign-in")),
      page.getByRole("button", { name: "Sign in" }).click(),
    ]);
    const expected =
      attempt < 6 ? /Email or password is incorrect\./ : /Too many attempts\. Try again in \d+ minutes?\./;
    await expect(page.locator("main [role=alert]")).toHaveText(expected);
  }
});

test.describe("protected routes", () => {
  for (const path of ["/app", "/app/dashboard", "/app/settings/security", "/app/exposures"]) {
    test(`${path} redirects anonymous visitors to sign-in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/auth\/sign-in\?returnTo=/, AFTER_SUBMIT);
    });
  }

  test("a forged session cookie is rejected by the server, not just the proxy", async ({ page, context }) => {
    await context.addCookies([
      { name: "exovault.session_token", value: "forged.value", url: "http://127.0.0.1:3100" },
    ]);
    await page.goto("/app/dashboard");
    await expect(page).toHaveURL(/\/auth\/sign-in/, AFTER_SUBMIT);
  });

  test("returnTo cannot redirect off-site", async ({ page }) => {
    await page.goto("/auth/sign-in?returnTo=https://evil.example/app");
    await expect(page.locator('input[name="returnTo"]')).toHaveValue("/app/dashboard");
  });

  test("Better Auth's HTTP API is not exposed", async ({ request }) => {
    const response = await request.post("/api/auth/sign-in/email", {
      data: { email: "a@example.com", password: "x" },
    });
    expect(response.status()).toBe(404);
  });
});
