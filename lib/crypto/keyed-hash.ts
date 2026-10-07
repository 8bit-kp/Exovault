import { createHmac, hkdfSync } from "node:crypto";
import { getEnv } from "@/config/env";

/**
 * Keyed, purpose-separated hashing (HMAC-SHA-256). Each purpose gets its own
 * subkey derived from BLIND_INDEX_PEPPER with HKDF, so a value hashed for rate
 * limiting can't be correlated with the same value hashed for audit logs or
 * the identity blind index (Phase 4). Never a bare hash: without the pepper the
 * output can't be reversed with a dictionary.
 */
export const KEYED_HASH_PURPOSES = [
  "rate-limit",
  "audit-subject",
  "audit-ip",
  "identity-blind-index",
  "identity-verification-code",
  "signup-nonce",
] as const;
export type KeyedHashPurpose = (typeof KEYED_HASH_PURPOSES)[number];

const subkeys = new Map<KeyedHashPurpose, Buffer>();

function subkey(purpose: KeyedHashPurpose): Buffer {
  let key = subkeys.get(purpose);
  if (!key) {
    const pepper = Buffer.from(getEnv().BLIND_INDEX_PEPPER, "base64");
    key = Buffer.from(hkdfSync("sha256", pepper, Buffer.alloc(0), `exovault:${purpose}:v1`, 32));
    subkeys.set(purpose, key);
  }
  return key;
}

/** Hex HMAC of `value` under the purpose's subkey. Callers normalize `value` first. */
export function keyedHash(purpose: KeyedHashPurpose, value: string): string {
  return createHmac("sha256", subkey(purpose)).update(value, "utf8").digest("hex");
}

/** Test hook: forget derived keys after the env changes. */
export function resetKeyedHashCache(): void {
  subkeys.clear();
}
