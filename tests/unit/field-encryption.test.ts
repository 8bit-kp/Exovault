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
import { normalizeIdentifier } from "@/lib/domain/identifier";

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

describe("normalizeIdentifier", () => {
  it("lower-cases, trims and NFKC-normalizes emails", () => {
    expect(normalizeIdentifier("email", "  Ana@EXAMPLE.com ")).toBe("ana@example.com");
    expect(normalizeIdentifier("email", "ａｎａ@example.com")).toBe("ana@example.com");
  });

  it("keeps dots and +tags: they are distinct literal addresses", () => {
    expect(normalizeIdentifier("email", "a.n.a+x@gmail.com")).toBe("a.n.a+x@gmail.com");
  });

  it("rejects identifier types that aren't supported yet", () => {
    expect(() => normalizeIdentifier("phone", "+15550100")).toThrow();
  });
});
