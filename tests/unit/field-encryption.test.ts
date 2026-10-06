import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptField,
  DecryptionError,
  encryptField,
  needsRotation,
  rotateField,
  type Keyring,
} from "@/lib/crypto/field-encryption";
import { normalizeEmail, normalizeIdentifier } from "@/lib/domain/identifier";

const key = () => randomBytes(32).toString("base64");
const v1 = key();
const v2 = key();
const ring = (active: string): Keyring => ({
  keys: new Map([
    ["v1", v1],
    ["v2", v2],
  ]),
  activeKeyId: active,
});

describe("field encryption", () => {
  it("round-trips and never contains the plaintext", () => {
    const encrypted = encryptField("ana@example.com", "identity:1", ring("v1"));
    expect(JSON.stringify(encrypted)).not.toContain("ana");
    expect(decryptField(encrypted, "identity:1", ring("v1"))).toBe("ana@example.com");
  });

  it("uses a fresh IV every time", () => {
    const a = encryptField("same", "identity:1", ring("v1"));
    const b = encryptField("same", "identity:1", ring("v1"));
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("binds the ciphertext to its record: a different AAD fails", () => {
    const encrypted = encryptField("ana@example.com", "identity:1", ring("v1"));
    expect(() => decryptField(encrypted, "identity:2", ring("v1"))).toThrow(DecryptionError);
  });

  it("detects tampering with ciphertext, tag or IV", () => {
    const encrypted = encryptField("ana@example.com", "identity:1", ring("v1"));
    const flip = (b64: string) => {
      const bytes = Buffer.from(b64, "base64");
      bytes[0] ^= 1;
      return bytes.toString("base64");
    };
    for (const field of ["ciphertext", "tag", "iv"] as const) {
      expect(() =>
        decryptField({ ...encrypted, [field]: flip(encrypted[field]) }, "identity:1", ring("v1")),
      ).toThrow(DecryptionError);
    }
  });

  it("does not leak the value in decryption errors", () => {
    const encrypted = encryptField("secret@example.com", "identity:1", ring("v1"));
    try {
      decryptField(encrypted, "wrong", ring("v1"));
    } catch (error) {
      expect(String(error)).not.toContain("secret");
      expect(String(error)).not.toContain(encrypted.ciphertext);
    }
  });

  it("supports rotation: old rows stay readable, rotated rows use the active key", () => {
    const old = encryptField("ana@example.com", "identity:1", ring("v1"));
    expect(needsRotation(old, ring("v2"))).toBe(true);
    expect(decryptField(old, "identity:1", ring("v2"))).toBe("ana@example.com");
    const rotated = rotateField(old, "identity:1", ring("v2"));
    expect(rotated.keyId).toBe("v2");
    expect(needsRotation(rotated, ring("v2"))).toBe(false);
    expect(decryptField(rotated, "identity:1", ring("v2"))).toBe("ana@example.com");
  });

  it("fails clearly when a retired key has been removed from the ring", () => {
    const old = encryptField("ana@example.com", "identity:1", ring("v1"));
    const onlyV2: Keyring = { keys: new Map([["v2", v2]]), activeKeyId: "v2" };
    expect(() => decryptField(old, "identity:1", onlyV2)).toThrow(/unknown key id/);
  });
});

describe("email normalization (spec 7.4)", () => {
  it.each([
    ["trims", "  ana@example.com ", "ana@example.com"],
    ["lower-cases the domain", "ana@EXAMPLE.COM", "ana@example.com"],
    ["lower-cases the local part", "Ana.B@example.com", "ana.b@example.com"],
    ["composes Unicode (NFC)", "jose\u0301@example.com", "jos\u00e9@example.com"],
    ["converts IDN domains to punycode", "ana@bücher.de", "ana@xn--bcher-kva.de"],
    ["keeps dots", "a.n.a@gmail.com", "a.n.a@gmail.com"],
    ["keeps +tags", "ana+news@gmail.com", "ana+news@gmail.com"],
  ])("%s", (_rule, input, expected) => {
    expect(normalizeEmail(input)).toBe(expected);
    expect(normalizeIdentifier("email", input)).toBe(expected);
  });

  it("does not fold compatibility characters (NFC, not NFKC)", () => {
    expect(normalizeEmail("ａｎａ@example.com")).not.toBe("ana@example.com");
  });

  it.each([
    "plainaddress",
    "@example.com",
    "ana@",
    "ana@@example.com",
    "ana@exa mple.com",
    "ana@example",
    ".ana@example.com",
    "ana.@example.com",
    "a..na@example.com",
    "ana@example.com/path",
    "ana@[127.0.0.1]",
    `${"a".repeat(65)}@example.com`,
  ])("rejects malformed %s instead of fixing it", (input) => {
    expect(normalizeEmail(input)).toBeNull();
    expect(() => normalizeIdentifier("email", input)).toThrow();
  });

  it("rejects identifier types that aren't supported yet", () => {
    expect(() => normalizeIdentifier("phone", "+15550100")).toThrow();
  });
});
