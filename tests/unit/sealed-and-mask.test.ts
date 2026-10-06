import { describe, expect, it } from "vitest";
import { seal, unseal } from "@/lib/crypto/sealed";
import { maskEmail } from "@/lib/utils/mask";

describe("seal / unseal", () => {
  it("round-trips a payload within its lifetime", () => {
    const token = seal("pending", { email: "a@example.com" }, 60);
    expect(unseal("pending", token)).toEqual({ email: "a@example.com" });
  });

  it("does not expose the payload in the token", () => {
    expect(seal("pending", { email: "a@example.com" }, 60)).not.toContain("example");
  });

  it("rejects expired, tampered, or wrong-purpose tokens", () => {
    const now = Date.now();
    const token = seal("pending", { email: "a@example.com" }, 60, now);
    expect(unseal("pending", token, now + 61_000)).toBeNull();
    expect(unseal("other", token, now)).toBeNull();
    const [v, iv, ct, tag] = token.split(".");
    const flipped = `${ct[0] === "A" ? "B" : "A"}${ct.slice(1)}`;
    expect(unseal("pending", [v, iv, flipped, tag].join("."), now)).toBeNull();
    expect(unseal("pending", "garbage", now)).toBeNull();
    expect(unseal("pending", undefined, now)).toBeNull();
  });
});

describe("maskEmail", () => {
  it.each([
    ["kishan@example.com", "k****n@example.com"],
    ["ab@example.com", "a****@example.com"],
    ["a@example.com", "a****@example.com"],
    ["not-an-email", "****"],
  ])("%s → %s", (input, expected) => expect(maskEmail(input)).toBe(expected));
});
