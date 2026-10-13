import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EnvValidationError, parseEnv } from "@/config/env";

const key = () => randomBytes(32).toString("base64");

function validSource(overrides: Record<string, string | undefined> = {}) {
  return {
    MONGODB_URI: "mongodb://127.0.0.1:27017/exovault",
    MONGODB_URI_TEST: "mongodb://127.0.0.1:27017/exovault_test",
    IDENTIFIER_ENCRYPTION_KEYS: `v1:${key()}`,
    IDENTIFIER_ENCRYPTION_ACTIVE_KEY_ID: "v1",
    BLIND_INDEX_PEPPER: key(),
    AUTH_SECRET: "x".repeat(40),
    ...overrides,
  };
}

function issuesFor(source: Record<string, string | undefined>): string[] {
  try {
    parseEnv(source);
  } catch (error) {
    if (error instanceof EnvValidationError) return error.issues;
    throw error;
  }
  return [];
}

describe("parseEnv", () => {
  it("accepts a minimal valid configuration and applies safe defaults", () => {
    const env = parseEnv(validSource());
    expect(env.PROVIDER_MODE).toBe("mock");
    expect(env.MAX_ACTIVE_IDENTITIES_PER_USER).toBe(1);
    expect(env.IDENTIFIER_ENCRYPTION_KEYS.get("v1")).toBeDefined();
  });

  it("rejects a MongoDB URI without a database name (would silently use `test`)", () => {
    expect(issuesFor(validSource({ MONGODB_URI: "mongodb://localhost:27017/" }))).toEqual([
      expect.stringContaining("MONGODB_URI"),
    ]);
  });

  it("requires the test database to be separate and end in _test", () => {
    expect(
      issuesFor(validSource({ MONGODB_URI_TEST: "mongodb://127.0.0.1:27017/exovault" })).join(),
    ).toContain("MONGODB_URI_TEST");
    expect(issuesFor(validSource({ MONGODB_URI_TEST: "mongodb://127.0.0.1:27017/other" })).join()).toContain(
      "MONGODB_URI_TEST",
    );
  });

  it("accepts credentials and srv URIs for deployed environments", () => {
    const env = parseEnv(
      validSource({
        MONGODB_URI: "mongodb+srv://app:s3cret@cluster0.example.net/exovault?retryWrites=true",
      }),
    );
    expect(env.MONGODB_URI).toContain("exovault");
  });

  it("requires HIBP_API_KEY only in live provider mode", () => {
    expect(issuesFor(validSource({ PROVIDER_MODE: "live" })).join()).toContain("HIBP_API_KEY");
    expect(
      issuesFor(validSource({ PROVIDER_MODE: "live", HIBP_API_KEY: "0123456789abcdef0123456789ABCDEF" })),
    ).toEqual([]);
    expect(issuesFor(validSource({ PROVIDER_MODE: "live", HIBP_API_KEY: "not-a-key" })).join()).toContain(
      "HIBP_API_KEY",
    );
  });

  it("treats empty values (`KEY=` lines) as unset so defaults apply", () => {
    const env = parseEnv(validSource({ HIBP_API_KEY: "", PROVIDER_MODE: "", LOG_LEVEL: "" }));
    expect(env.HIBP_API_KEY).toBeUndefined();
    expect(env.PROVIDER_MODE).toBe("mock");
  });

  it("validates the encryption keyring and active key id", () => {
    expect(issuesFor(validSource({ IDENTIFIER_ENCRYPTION_KEYS: "v1:tooshort" })).join()).toContain(
      "IDENTIFIER_ENCRYPTION_KEYS",
    );
    expect(issuesFor(validSource({ IDENTIFIER_ENCRYPTION_ACTIVE_KEY_ID: "v2" })).join()).toContain(
      "IDENTIFIER_ENCRYPTION_ACTIVE_KEY_ID",
    );
    const env = parseEnv(
      validSource({
        IDENTIFIER_ENCRYPTION_KEYS: `v1:${key()},v2:${key()}`,
        IDENTIFIER_ENCRYPTION_ACTIVE_KEY_ID: "v2",
      }),
    );
    expect([...env.IDENTIFIER_ENCRYPTION_KEYS.keys()]).toEqual(["v1", "v2"]);
  });

  it("rejects placeholder secrets copied from .env.example", () => {
    const issues = issuesFor(
      validSource({
        BLIND_INDEX_PEPPER: "REPLACE_WITH_32_BYTES_BASE64",
        IDENTIFIER_ENCRYPTION_KEYS: "v1:REPLACE_WITH_32_BYTES_BASE64",
      }),
    ).join("\n");
    expect(issues).toContain("BLIND_INDEX_PEPPER");
    expect(issues).toContain("IDENTIFIER_ENCRYPTION_KEYS");
  });

  it("never echoes secret values in validation errors", () => {
    const planted = "PLANTED-SECRET-VALUE-123";
    const issues = issuesFor(
      validSource({
        AUTH_SECRET: planted,
        BLIND_INDEX_PEPPER: planted,
        IDENTIFIER_ENCRYPTION_KEYS: `v1:${planted}`,
      }),
    );
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.join("\n")).not.toContain(planted);
  });

  it("defaults to the worker scheduler, and requires a cron secret and inline scans for SCHEDULER=cron", () => {
    expect(parseEnv(validSource()).SCHEDULER).toBe("worker");
    expect(issuesFor(validSource({ SCHEDULER: "cron" })).join("\n")).toContain("CRON_SECRET is required");
    expect(issuesFor(validSource({ SCHEDULER: "cron", CRON_SECRET: "short" })).join("\n")).toContain(
      "CRON_SECRET must be at least 32 characters",
    );
    expect(
      issuesFor(validSource({ SCHEDULER: "cron", CRON_SECRET: "c".repeat(40), SCAN_QUEUE: "bullmq" })).join(
        "\n",
      ),
    ).toContain("SCAN_QUEUE must be inline");
    const env = parseEnv(validSource({ SCHEDULER: "cron", CRON_SECRET: "c".repeat(40) }));
    expect(env.CRON_INTERVAL_MINUTES).toBe(1440);
  });

  it("allows demo mode only with fictional data", () => {
    expect(parseEnv(validSource()).DEMO_MODE).toBe("off");
    expect(
      issuesFor(validSource({ DEMO_MODE: "on", PROVIDER_MODE: "live", HIBP_API_KEY: "a".repeat(32) })).join(
        "\n",
      ),
    ).toContain("PROVIDER_MODE must be mock");
    expect(parseEnv(validSource({ DEMO_MODE: "on" })).DEMO_ACCOUNT_EMAIL).toBe("demo@exovault.example");
    expect(issuesFor(validSource({ DEMO_ACCOUNT_PASSWORD: "short" })).join("\n")).toContain(
      "DEMO_ACCOUNT_PASSWORD must be at least 12 characters",
    );
  });
});
