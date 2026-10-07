import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Isolated E2E environment: its own database and Redis DB, Mailpit for email,
 * and the password-breach API off (no live third-party calls in tests). These
 * override anything in .env.local.
 */
export const E2E_ENV = {
  APP_URL: BASE_URL,
  MONGODB_URI: "mongodb://127.0.0.1:27017/exovault_e2e",
  MONGODB_URI_TEST: "mongodb://127.0.0.1:27017/exovault_e2e_test",
  REDIS_URL: "redis://127.0.0.1:6379/14",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "1025",
  PASSWORD_BREACH_CHECK: "off",
  LOG_LEVEL: "warn",
  // Simulates one trusted reverse proxy: each test supplies its own client IP via
  // X-Forwarded-For, so parallel tests don't share per-IP rate-limit budgets (D-021).
  TRUSTED_PROXY_COUNT: "1",
  // Two, so E2E can exercise verifying a second address and hitting the limit.
  MAX_ACTIVE_IDENTITIES_PER_USER: "2",
  // Scans run in the separate BullMQ worker, as in a production deployment (D-032).
  SCAN_QUEUE: "bullmq",
};

/**
 * E2E runs against a production build (`next start`), because CSP, security
 * headers and rendering differ in dev. `npm run test:e2e` builds first.
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  // Auth flows hash passwords (scrypt) server-side; cap parallelism so a busy dev machine doesn't time out.
  workers: process.env.CI ? 2 : 4,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    // CI provides Mailpit as a service container; locally we start the binary (brew install mailpit).
    ...(process.env.CI
      ? []
      : [
          {
            command: "mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025",
            url: "http://127.0.0.1:8025/readyz",
            reuseExistingServer: true,
            timeout: 15_000,
          },
        ]),
    {
      // The worker has no HTTP port: wait for its startup log line instead.
      command: "npx tsx --conditions=react-server --env-file-if-exists=.env.local workers/index.ts",
      wait: { stdout: /worker started/ },
      reuseExistingServer: false,
      timeout: 60_000,
      env: { ...E2E_ENV, LOG_LEVEL: "info" },
    },
    {
      command: `npx next start --hostname 127.0.0.1 --port ${PORT}`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: E2E_ENV,
    },
  ],
});
