import { describe, expect, it } from "vitest";
import { fieldErrors, resetPasswordSchema, signInSchema, signUpSchema } from "@/lib/validation/auth";

describe("auth validation", () => {
  it("normalizes email case and whitespace", () => {
    const parsed = signUpSchema.parse({ email: "  Ana@Example.COM ", password: "correct horse battery" });
    expect(parsed.email).toBe("ana@example.com");
  });

  it("enforces length, not composition (NIST 800-63B)", () => {
    expect(signUpSchema.safeParse({ email: "a@example.com", password: "short" }).success).toBe(false);
    expect(signUpSchema.safeParse({ email: "a@example.com", password: "alllowercaseletters" }).success).toBe(
      true,
    );
    expect(signUpSchema.safeParse({ email: "a@example.com", password: "x".repeat(129) }).success).toBe(false);
  });

  it("rejects non-string and operator-shaped input", () => {
    expect(signInSchema.safeParse({ email: { $ne: null }, password: "x" }).success).toBe(false);
    expect(signInSchema.safeParse({ email: "a@example.com", password: { $gt: "" } }).success).toBe(false);
  });

  it("requires the confirmation to match on reset", () => {
    const result = resetPasswordSchema.safeParse({
      token: "t".repeat(32),
      password: "a long enough password",
      confirmPassword: "something else entirely",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error)).toHaveProperty("confirmPassword");
  });

  it("reports one message per field", () => {
    const result = signUpSchema.safeParse({ email: "", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) expect(Object.keys(fieldErrors(result.error)).sort()).toEqual(["email", "password"]);
  });
});
