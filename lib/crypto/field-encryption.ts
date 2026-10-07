import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getEnv } from "@/config/env";

/**
 * Field-level encryption for identifiers (spec 5.1). AES-256-GCM with a
 * random 96-bit IV, keys from a versioned keyring (`IDENTIFIER_ENCRYPTION_KEYS`),
 * and associated data (AAD) that binds each ciphertext to its record, so a
 * ciphertext copied onto another document fails authentication.
 *
 * Rotation: new writes use the active key; reads select the key by the stored
 * `keyId`; `scripts/rotate-identity-keys.ts` rewrites rows under old keys.
 */

export interface EncryptedValue {
  /** Format version of this envelope. */
  v: 1;
  keyId: string;
  iv: string;
  ciphertext: string;
  tag: string;
}

/** What comes back from the database: the version is checked at runtime. */
export type StoredEncryptedValue = Omit<EncryptedValue, "v"> & { v: number };

export interface Keyring {
  keys: ReadonlyMap<string, string>;
  activeKeyId: string;
}

export class DecryptionError extends Error {
  constructor(reason: string) {
    super(`Could not decrypt field: ${reason}`);
    this.name = "DecryptionError";
  }
}

export function keyringFromEnv(): Keyring {
  const env = getEnv();
  return { keys: env.IDENTIFIER_ENCRYPTION_KEYS, activeKeyId: env.IDENTIFIER_ENCRYPTION_ACTIVE_KEY_ID };
}

function keyBytes(keyring: Keyring, keyId: string): Buffer {
  const encoded = keyring.keys.get(keyId);
  if (!encoded) throw new DecryptionError(`unknown key id "${keyId}"`);
  return Buffer.from(encoded, "base64");
}

export function encryptField(
  plaintext: string,
  aad: string,
  keyring: Keyring = keyringFromEnv(),
): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(keyring, keyring.activeKeyId), iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    v: 1,
    keyId: keyring.activeKeyId,
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptField(
  value: StoredEncryptedValue,
  aad: string,
  keyring: Keyring = keyringFromEnv(),
): string {
  if (value.v !== 1) throw new DecryptionError("unsupported envelope version");
  try {
    const tag = Buffer.from(value.tag, "base64");
    if (tag.length !== 16) throw new DecryptionError("invalid tag length");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      keyBytes(keyring, value.keyId),
      Buffer.from(value.iv, "base64"),
      { authTagLength: 16 },
    );
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof DecryptionError) throw error;
    // Never include the ciphertext or the cause's message: it can't help an attacker or a log reader.
    throw new DecryptionError("authentication failed");
  }
}

/** True when the value was written under a key other than the active one. */
export function needsRotation(value: StoredEncryptedValue, keyring: Keyring = keyringFromEnv()): boolean {
  return value.keyId !== keyring.activeKeyId;
}

/** Re-encrypt under the active key (same AAD). */
export function rotateField(
  value: StoredEncryptedValue,
  aad: string,
  keyring: Keyring = keyringFromEnv(),
): EncryptedValue {
  return encryptField(decryptField(value, aad, keyring), aad, keyring);
}
