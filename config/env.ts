import { z } from "zod";

/**
 * Environment validation. `parseEnv` is pure (testable); `getEnv` validates
 * process.env once and fails fast with a readable message.
 *
 * Shared by the Next.js app, the worker, and scripts — so it must not import
 * any Next-only module.
 */

/** A MongoDB URI that names a database (a bare `.../` silently means `test`). */
const mongoUri = z
  .string()
  .min(1)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === "mongodb:" || url.protocol === "mongodb+srv:") &&
        url.pathname.replace(/^\//, "").length > 0
      );
    } catch {
      return false;
    }
  }, "must be a mongodb:// or mongodb+srv:// URI that includes a database name, e.g. mongodb://127.0.0.1:27017/exovault");

export function databaseNameOf(uri: string): string {
  return new URL(uri).pathname.replace(/^\//, "");
}

/** 32 random bytes, base64-encoded (AES-256 key / HMAC pepper). */
const base64Key32 = z.string().refine((value) => {
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
}, "must be 32 random bytes encoded as base64 (run `npm run env:init`)");

/** Keyring format: `keyId:base64key[,keyId:base64key...]` — supports rotation. */
const keyring = z
  .string()
  .min(1)
  .transform((value, ctx) => {
    const keys = new Map<string, string>();
    for (const entry of value.split(",")) {
      const [id, key, ...rest] = entry.trim().split(":");
      if (!id || !key || rest.length > 0 || !/^[a-z0-9_-]{1,32}$/i.test(id)) {
        ctx.addIssue({ code: "custom", message: "entries must look like `v1:<base64 key>`" });
        return z.NEVER;
      }
      if (!base64Key32.safeParse(key).success) {
        ctx.addIssue({ code: "custom", message: `key "${id}" must be 32 bytes of base64` });
        return z.NEVER;
      }
      if (keys.has(id)) {
        ctx.addIssue({ code: "custom", message: `duplicate key id "${id}"` });
        return z.NEVER;
      }
      keys.set(id, key);
    }
    return keys;
  });

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url().default("http://localhost:3000"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

    MONGODB_URI: mongoUri,
    MONGODB_URI_TEST: mongoUri,
    REDIS_URL: z.url().default("redis://127.0.0.1:6379"),
    // inline: scans run inside the web process (M1, single Node server). bullmq: a separate worker runs them (D-032).
    SCAN_QUEUE: z.enum(["inline", "bullmq"]).default("inline"),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
    // How often the worker looks for identities due a scheduled scan.
    MONITORING_TICK_MS: z.coerce.number().int().min(5_000).max(3_600_000).default(60_000),
    // How often the worker sends due alerts.
    NOTIFICATION_DISPATCH_MS: z.coerce.number().int().min(5_000).max(3_600_000).default(60_000),

    PROVIDER_MODE: z.enum(["mock", "live"]).default("mock"),
    HIBP_API_KEY: z
      .string()
      .regex(/^[0-9a-f]{32}$/i, "must be the 32-character hexadecimal key from haveibeenpwned.com/API/Key")
      .optional(),
    // Must match the purchased HIBP subscription (Core 1 = 10).
    HIBP_REQUESTS_PER_MINUTE: z.coerce.number().int().min(1).max(100_000).default(10),

    IDENTIFIER_ENCRYPTION_KEYS: keyring,
    IDENTIFIER_ENCRYPTION_ACTIVE_KEY_ID: z.string().min(1),
    BLIND_INDEX_PEPPER: base64Key32,
    AUTH_SECRET: z.string().min(32, "must be at least 32 characters (run `npm run env:init`)"),

    // Check new passwords against the Pwned Passwords range API (k-anonymity). Off in automated tests.
    PASSWORD_BREACH_CHECK: z.enum(["on", "off"]).default("on"),
    // Number of reverse proxies in front of the app whose X-Forwarded-For entries we trust (D-021).
    TRUSTED_PROXY_COUNT: z.coerce.number().int().min(0).max(5).default(0),

    SMTP_HOST: z.string().default("127.0.0.1"),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SMTP_SECURE: z.enum(["true", "false"]).default("false"),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    EMAIL_FROM: z.string().default("Exovault <no-reply@exovault.example>"),

    MAX_ACTIVE_IDENTITIES_PER_USER: z.coerce.number().int().min(1).max(50).default(1),
  })
  .superRefine((env, ctx) => {
    if (!env.IDENTIFIER_ENCRYPTION_KEYS.has(env.IDENTIFIER_ENCRYPTION_ACTIVE_KEY_ID)) {
      ctx.addIssue({
        code: "custom",
        path: ["IDENTIFIER_ENCRYPTION_ACTIVE_KEY_ID"],
        message: "must reference a key id present in IDENTIFIER_ENCRYPTION_KEYS",
      });
    }
    if (env.PROVIDER_MODE === "live" && !env.HIBP_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["HIBP_API_KEY"],
        message: "is required when PROVIDER_MODE=live",
      });
    }
    const devDb = databaseNameOf(env.MONGODB_URI);
    const testDb = databaseNameOf(env.MONGODB_URI_TEST);
    if (devDb === testDb || !testDb.endsWith("_test")) {
      ctx.addIssue({
        code: "custom",
        path: ["MONGODB_URI_TEST"],
        message: "must point to a separate database whose name ends in `_test`",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "EnvValidationError";
  }
}

/** Validate an env-like record. Messages name the variable, never its value. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  // `KEY=` in an env file means "unset", not "empty string".
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ""));
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`),
    );
  }
  return result.data;
}

let cached: Env | undefined;

export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
