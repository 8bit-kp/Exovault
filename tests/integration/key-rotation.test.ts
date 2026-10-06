import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { getEnv } from "@/config/env";
import { type Keyring } from "@/lib/crypto/field-encryption";
import { Identity } from "@/models/Identity";
import { revealIdentity, addEmailIdentity } from "@/server/services/identity/identity-service";
import { rotateIdentityKeys } from "@/server/services/identity/key-rotation";
import { setupAuthHarness } from "./helpers/auth-harness";

setupAuthHarness();

describe("identity key rotation", () => {
  it("re-encrypts old rows under the new active key and keeps them readable", async () => {
    const actor = {
      userId: new Types.ObjectId().toHexString(),
      accountEmail: "rot@example.com",
      accountEmailVerified: true,
    };
    const added = await addEmailIdentity(actor, "rot@example.com", { ip: "203.0.113.1", requestId: null });
    if (!added.ok) throw new Error("setup");
    const before = await Identity.findById(added.identityId).lean();
    expect(before?.valueEncrypted.keyId).toBe("v1");

    const v1 = getEnv().IDENTIFIER_ENCRYPTION_KEYS.get("v1")!;
    const ring: Keyring = {
      keys: new Map([
        ["v1", v1],
        ["v2", randomBytes(32).toString("base64")],
      ]),
      activeKeyId: "v2",
    };

    expect(await rotateIdentityKeys(ring)).toEqual({ scanned: 1, rotated: 1, skipped: 0, failed: 0 });
    const after = await Identity.findById(added.identityId).lean();
    expect(after?.valueEncrypted.keyId).toBe("v2");
    expect(after?.valueEncrypted.ciphertext).not.toBe(before?.valueEncrypted.ciphertext);
    // Blind index and mask are key-independent and unchanged.
    expect(after?.valueBlindIndex).toBe(before?.valueBlindIndex);

    expect(await rotateIdentityKeys(ring)).toEqual({ scanned: 0, rotated: 0, skipped: 0, failed: 0 });
    // The app (still configured with v1 only) can no longer read it: proves the row really moved to v2.
    expect(await revealIdentity(actor, added.identityId, { ip: "x", requestId: null })).toEqual({
      ok: false,
      reason: "error",
    });
  });
});
