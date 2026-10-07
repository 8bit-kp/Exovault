import { expect, test } from "./fixtures";
import { AFTER_SUBMIT, PASSWORD, signUpAndVerify } from "./helpers";
import { uniqueEmail } from "./mailpit";

test.describe.configure({ mode: "default", timeout: 120_000 });

/**
 * CSRF on Server Actions (spec 4.2, 12.4): replay a real action request with a
 * foreign Origin, as a cross-site form or fetch would send it. Next.js must
 * refuse to run the action.
 */
test("a Server Action replayed from another origin is refused", async ({
  page,
  context,
  consoleProblems,
}) => {
  const email = uniqueEmail("csrf");
  await signUpAndVerify(page, email);
  await page.goto("/app/dashboard");
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/$/, AFTER_SUBMIT);

  await page.goto("/auth/sign-in");
  let forgedStatus = 0;
  await page.route("**/auth/sign-in", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    const headers = { ...request.headers(), origin: "https://evil.example" };
    const response = await route.fetch({ headers });
    forgedStatus = response.status();
    await route.fulfill({ response });
  });
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect.poll(() => forgedStatus, AFTER_SUBMIT).toBeGreaterThanOrEqual(400);

  // The action didn't run: no session cookie was issued.
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name.endsWith("session_token"))).toBeUndefined();

  // The refusal surfaces as a 500 and a client-side error: expected here, so don't fail on them.
  const unexpected = consoleProblems.filter(
    (p) =>
      !/^500 \/auth\/sign-in$|Server Action|server component|unexpected response|An error occurred|React error #441/i.test(
        p,
      ),
  );
  consoleProblems.splice(0, consoleProblems.length, ...unexpected);
});

test("pages can't be framed by other sites", async ({ request }) => {
  const headers = (await request.get("/")).headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("security.txt is served (RFC 9116)", async ({ request }) => {
  const response = await request.get("/.well-known/security.txt");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toMatch(/^Contact: mailto:/m);
  const expires = Date.parse(body.match(/^Expires: (.+)$/m)![1]);
  expect(expires).toBeGreaterThan(Date.now());
  expect(expires).toBeLessThan(Date.now() + 366 * 24 * 60 * 60 * 1000);
});

test("API responses carry a deny-all CSP and are never cached", async ({ request }) => {
  const response = await request.get("/api/scans/0123456789abcdef01234567");
  expect(response.status()).toBe(401);
  expect(response.headers()["content-security-policy"]).toContain("default-src 'none'");
  expect(response.headers()["cache-control"]).toBe("no-store");
});
