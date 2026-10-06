import { describe, expect, it } from "vitest";
import { scrubMessage } from "@/lib/logging/scrub";

describe("scrubMessage", () => {
  it("removes email addresses from library log text", () => {
    expect(scrubMessage("Sign-up attempt for existing email: Ana.B+x@Example.co.uk")).toBe(
      "Sign-up attempt for existing email: [email]",
    );
  });

  it("removes bearer and token values", () => {
    const out = scrubMessage("retry with Bearer abcdefghijklmnop and token=QWERTYUIOP123456");
    expect(out).not.toContain("abcdefghijklmnop");
    expect(out).not.toContain("QWERTYUIOP123456");
  });

  it("leaves ordinary text alone", () => {
    expect(scrubMessage("User not found")).toBe("User not found");
  });
});
