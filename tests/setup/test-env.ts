/**
 * Deterministic, non-secret configuration for automated tests. Runs before
 * every test file in the node project. Tests never read .env.local, so they
 * can't touch the dev database or real SMTP by accident.
 */
const TEST_ENV: Record<string, string> = {
  NODE_ENV: "test",
  APP_URL: "http://127.0.0.1:3100",
  LOG_LEVEL: "silent",
  MONGODB_URI: "mongodb://127.0.0.1:27017/exovault",
  MONGODB_URI_TEST: "mongodb://127.0.0.1:27017/exovault_test",
  REDIS_URL: "redis://127.0.0.1:6379/15",
  IDENTIFIER_ENCRYPTION_KEYS: "v1:dGVzdC1vbmx5LWtleS10ZXN0LW9ubHkta2V5LXRlc3Q=",
  IDENTIFIER_ENCRYPTION_ACTIVE_KEY_ID: "v1",
  BLIND_INDEX_PEPPER: "dGVzdC1vbmx5LXBlcHBlci10ZXN0LW9ubHktcGVwcHI=",
  AUTH_SECRET: "test-only-auth-secret-test-only-auth-secret",
  PASSWORD_BREACH_CHECK: "off",
};

for (const [key, value] of Object.entries(TEST_ENV)) {
  process.env[key] ??= value;
}
