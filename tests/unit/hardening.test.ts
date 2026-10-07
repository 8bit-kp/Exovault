import { describe, expect, it } from "vitest";
import { trustedRequestId } from "@/lib/auth/request-context";
import { parseObjectId } from "@/lib/db/object-id";
import { scrubMessage } from "@/lib/logging/scrub";
import { safeEvidenceUrl } from "@/server/services/exposure/engine";

describe("trustedRequestId", () => {
  it("keeps proxy-issued UUIDs and replaces anything else", () => {
    const uuid = "3f1e2d4c-5b6a-4789-8abc-def012345678";
    expect(trustedRequestId(uuid)).toBe(uuid);
    for (const bad of [null, "", "x".repeat(10_000), "abc\r\nSet-Cookie: x", '{"$ne":1}']) {
      const id = trustedRequestId(bad);
      expect(id).not.toBe(bad);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});

describe("safeEvidenceUrl", () => {
  it("only lets absolute https URLs through to <a href>", () => {
    expect(safeEvidenceUrl("https://haveibeenpwned.com/Breach/Adobe")).toEqual([
      "https://haveibeenpwned.com/Breach/Adobe",
    ]);
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html,<script>",
      "http://example.com",
      "/relative",
      "nope",
      undefined,
      `https://x.io/${"a".repeat(600)}`,
    ]) {
      expect(safeEvidenceUrl(bad)).toEqual([]);
    }
  });
});

describe("parseObjectId", () => {
  it("accepts only canonical 24-hex ids", () => {
    expect(parseObjectId("0123456789abcdef01234567")?.toHexString()).toBe("0123456789abcdef01234567");
    for (const bad of ["123456789012", "0123456789ABCDEF01234567", "", { $ne: null }, 42, null]) {
      expect(parseObjectId(bad)).toBeNull();
    }
  });
});

describe("scrubMessage bounds", () => {
  it("handles very long input quickly", () => {
    const started = performance.now();
    scrubMessage(`a@${"a".repeat(200_000)}`);
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe("GCM tag length (D-035)", () => {
  it("sealed tokens reject truncated tags", async () => {
    const { seal, unseal } = await import("@/lib/crypto/sealed");
    const token = seal("unsubscribe", { userId: "0123456789abcdef01234567" }, 60);
    const [v, iv, ct, tag] = token.split(".");
    const short = Buffer.from(tag, "base64url").subarray(0, 4).toString("base64url");
    expect(unseal("unsubscribe", [v, iv, ct, short].join("."))).toBeNull();
    expect(unseal("unsubscribe", token)).toEqual({ userId: "0123456789abcdef01234567" });
  });

  it("field decryption rejects truncated tags", async () => {
    const { randomBytes } = await import("node:crypto");
    const { decryptField, encryptField, DecryptionError } = await import("@/lib/crypto/field-encryption");
    const ring = { keys: new Map([["v1", randomBytes(32).toString("base64")]]), activeKeyId: "v1" };
    const value = encryptField("a@example.com", "identity:1", ring);
    const short = { ...value, tag: Buffer.from(value.tag, "base64").subarray(0, 4).toString("base64") };
    expect(() => decryptField(short, "identity:1", ring)).toThrow(DecryptionError);
  });
});

describe("production refuses test secrets (D-035)", () => {
  const base = {
    NODE_ENV: "production",
    MONGODB_URI: "mongodb://127.0.0.1:27017/exovault",
    MONGODB_URI_TEST: "mongodb://127.0.0.1:27017/exovault_test",
    IDENTIFIER_ENCRYPTION_KEYS: "v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    IDENTIFIER_ENCRYPTION_ACTIVE_KEY_ID: "v1",
    BLIND_INDEX_PEPPER: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    AUTH_SECRET: "ci-only-not-a-secret-ci-only-not-a-secret",
  };

  it("rejects all-zero keys and CI/test secrets", async () => {
    const { parseEnv, EnvValidationError } = await import("@/config/env");
    let issues = "";
    try {
      parseEnv(base);
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      issues = (error as InstanceType<typeof EnvValidationError>).issues.join("\n");
    }
    expect(issues).toMatch(/IDENTIFIER_ENCRYPTION_KEYS/);
    expect(issues).toMatch(/BLIND_INDEX_PEPPER/);
    expect(issues).toMatch(/AUTH_SECRET/);
  });

  it("allows them only when CI opts in explicitly, or outside production", async () => {
    const { parseEnv } = await import("@/config/env");
    expect(() => parseEnv({ ...base, EXOVAULT_ALLOW_TEST_SECRETS: "1" })).not.toThrow();
    expect(() => parseEnv({ ...base, NODE_ENV: "development" })).not.toThrow();
  });
});
