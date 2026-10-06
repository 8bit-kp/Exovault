import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { getEnv } from "@/config/env";

/**
 * Small authenticated-encrypted payloads for short-lived cookies (AES-256-GCM,
 * key derived from AUTH_SECRET with HKDF, per-purpose). The browser can't read
 * or forge them, and they carry their own expiry.
 */
const VERSION = "v1";

function key(purpose: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", getEnv().AUTH_SECRET, Buffer.alloc(0), `exovault:sealed:${purpose}`, 32),
  );
}

export function seal(purpose: string, payload: unknown, ttlSeconds: number, now = Date.now()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(purpose), iv);
  const body = JSON.stringify({ p: payload, exp: now + ttlSeconds * 1000 });
  const ciphertext = Buffer.concat([cipher.update(body, "utf8"), cipher.final()]);
  return [
    VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

/** Returns null for anything tampered, expired, malformed, or sealed for another purpose. */
export function unseal<T>(purpose: string, token: string | undefined, now = Date.now()): T | null {
  if (!token || token.length > 4096) return null;
  const [version, iv, ciphertext, tag] = token.split(".");
  if (version !== VERSION || !iv || !ciphertext || !tag) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(purpose), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plain) as { p: T; exp: number };
    return typeof parsed.exp === "number" && parsed.exp > now ? parsed.p : null;
  } catch {
    return null;
  }
}
