import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect } from "./fixtures";
import { codeFrom, waitForEmail } from "./mailpit";

export const PASSWORD = "a long and memorable passphrase";

/** Navigation after a Server Action that hashes a password; generous for loaded CI/dev machines. */
export const AFTER_SUBMIT = { timeout: 30_000 };

export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
  ).toEqual([]);
}

/** Sign up and verify the account email; ends on the onboarding welcome screen. */
export async function signUpAndVerify(page: Page, email: string) {
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
  await expect(page).toHaveURL(/\/onboarding$/, AFTER_SUBMIT);
  // The pending-verification cookie must not outlive its purpose (D-035).
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name.endsWith("pending_verification"))).toBeUndefined();
}

export async function signUpToDashboard(page: Page, email: string) {
  await signUpAndVerify(page, email);
  await page.goto("/app/dashboard");
}
