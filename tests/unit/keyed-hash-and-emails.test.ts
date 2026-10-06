import { describe, expect, it } from "vitest";
import { keyedHash } from "@/lib/crypto/keyed-hash";
import {
  accountExistsMessage,
  resetPasswordMessage,
  verifyEmailMessage,
} from "@/server/services/notification/auth-emails";

describe("keyedHash", () => {
  it("is deterministic per purpose and separated across purposes", () => {
    expect(keyedHash("rate-limit", "a@example.com")).toBe(keyedHash("rate-limit", "a@example.com"));
    expect(keyedHash("rate-limit", "a@example.com")).not.toBe(keyedHash("audit-subject", "a@example.com"));
  });

  it("is not a bare SHA-256 of the input", async () => {
    const { createHash } = await import("node:crypto");
    const bare = createHash("sha256").update("a@example.com").digest("hex");
    expect(keyedHash("rate-limit", "a@example.com")).not.toBe(bare);
  });
});

describe("auth emails", () => {
  const to = "user@example.com";

  it("never put the recipient or other identifiers in the subject", () => {
    for (const message of [
      verifyEmailMessage(to, "123456"),
      resetPasswordMessage(to, "https://x/reset?token=t"),
      accountExistsMessage(to, "https://x/auth/sign-in"),
    ]) {
      expect(message.subject).not.toContain(to);
      expect(message.subject).not.toContain("token");
    }
  });

  it("puts the one-time code in the body only", () => {
    const message = verifyEmailMessage(to, "482913");
    expect(message.subject).not.toContain("482913");
    expect(message.text).toContain("482913");
  });

  it("escapes values interpolated into HTML", () => {
    const message = resetPasswordMessage(to, 'https://x/?a="><script>alert(1)</script>');
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&#60;script&#62;");
  });
});
