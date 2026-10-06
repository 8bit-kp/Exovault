import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { getAuthDb } from "@/lib/db/mongo-client";
import { Identity } from "@/models/Identity";
import {
  addEmailIdentity,
  listIdentities,
  removeIdentity,
  resendIdentityCode,
  revealIdentity,
  verifyIdentityCode,
  type Actor,
} from "@/server/services/identity/identity-service";
import { latestIdentityCode, outbox, setupAuthHarness } from "./helpers/auth-harness";

setupAuthHarness();

const ctx = { ip: "203.0.113.10", requestId: "req-identity" };
const actor = (email = "owner@example.com"): Actor => ({
  userId: new Types.ObjectId().toHexString(),
  accountEmail: email,
  accountEmailVerified: true,
});

describe("adding an email identity", () => {
  it("auto-verifies the user's own verified account email and sends no code", async () => {
    const a = actor("Owner@Example.com");
    const result = await addEmailIdentity(a, "  owner@example.COM ", ctx);
    expect(result).toMatchObject({ ok: true, verification: "verified" });
    expect(outbox.outbox).toHaveLength(0);
    expect((await listIdentities(a.userId))[0]).toMatchObject({
      masked: "o****r@example.com",
      verification: "verified",
    });
  });

  it("does not auto-verify when the account email itself is unverified", async () => {
    const a = { ...actor(), accountEmailVerified: false };
    expect(await addEmailIdentity(a, a.accountEmail, ctx)).toMatchObject({
      ok: true,
      verification: "pending",
    });
  });

  it("requires a code for any other address and emails it to that address only", async () => {
    const a = actor();
    const result = await addEmailIdentity(a, "other@example.org", ctx);
    expect(result).toMatchObject({ ok: true, verification: "pending" });
    expect(outbox.outbox.map((m) => m.to)).toEqual(["other@example.org"]);
    expect(outbox.outbox[0].subject).not.toContain("other@example.org");
  });

  it("stores ciphertext, a blind index and a mask, never the plaintext (what Compass shows)", async () => {
    const a = actor();
    await addEmailIdentity(a, "secret.person@example.org", ctx);
    const raw = await getAuthDb().collection("identities").findOne({ userId: a.userId });
    const dump = JSON.stringify(raw);
    expect(dump).not.toContain("secret.person@example.org");
    expect(dump).not.toContain("secret.person");
    expect(raw?.valueEncrypted).toMatchObject({ v: 1, keyId: "v1" });
    expect(raw?.valueBlindIndex).toMatch(/^[0-9a-f]{64}$/);
    expect(raw?.valueMasked).toBe("s****n@example.org");
  });

  it("stores the ownership code only as a keyed hash", async () => {
    const a = actor();
    await addEmailIdentity(a, "other@example.org", ctx);
    const code = latestIdentityCode("other@example.org");
    const dump = JSON.stringify(await getAuthDb().collection("identityVerifications").find({}).toArray());
    expect(dump).not.toContain(code);
  });

  it("rejects a duplicate (any spelling) for the same user", async () => {
    const a = actor();
    await addEmailIdentity(a, "dup@example.org", ctx);
    expect(await addEmailIdentity(a, " DUP@example.org", ctx)).toMatchObject({ ok: false });
  });

  it("enforces the active-identity limit (default 1), even under concurrent requests", async () => {
    const a = actor();
    const results = await Promise.all(
      ["a@example.org", "b@example.org", "c@example.org", "d@example.org"].map((v) =>
        addEmailIdentity(a, v, ctx),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "limit_reached")).toHaveLength(3);
    expect(await Identity.countDocuments({ userId: a.userId })).toBe(1);
  });

  it("frees the slot when an identity is removed", async () => {
    const a = actor();
    const first = await addEmailIdentity(a, "first@example.org", ctx);
    if (!first.ok) throw new Error("setup");
    expect(await addEmailIdentity(a, "second@example.org", ctx)).toMatchObject({
      ok: false,
      reason: "limit_reached",
    });
    expect(await removeIdentity(a, first.identityId, ctx)).toEqual({ ok: true });
    expect(await addEmailIdentity(a, "second@example.org", ctx)).toMatchObject({ ok: true });
  });

  it("rejects malformed and operator-shaped input", async () => {
    const a = actor();
    for (const bad of [
      "not-an-email",
      "",
      { $ne: null },
      ["a@example.org"],
      "x".repeat(300) + "@example.org",
    ]) {
      expect(await addEmailIdentity(a, bad, ctx)).toMatchObject({ ok: false, reason: "invalid" });
    }
  });

  it("limits identity creation attempts to 5 a day per user", async () => {
    const a = actor();
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await addEmailIdentity(a, `try${i}@example.org`, ctx));
    expect(results[5]).toMatchObject({ ok: false, reason: "rate_limited" });
  });
});

describe("ownership verification", () => {
  async function pending() {
    const a = actor();
    const added = await addEmailIdentity(a, "other@example.org", ctx);
    if (!added.ok) throw new Error("setup");
    return { a, id: added.identityId, code: latestIdentityCode("other@example.org") };
  }

  it("verifies with the emailed code, once", async () => {
    const { a, id, code } = await pending();
    expect(await verifyIdentityCode(a, id, code, ctx)).toEqual({ ok: true });
    expect((await listIdentities(a.userId))[0].verification).toBe("verified");
    expect(await verifyIdentityCode(a, id, code, ctx)).toEqual({ ok: false, reason: "already_verified" });
  });

  it("burns the code after 5 wrong guesses", async () => {
    const { a, id, code } = await pending();
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++)
      expect(await verifyIdentityCode(a, id, wrong, ctx)).toMatchObject({ reason: "invalid" });
    expect(await verifyIdentityCode(a, id, wrong, ctx)).toMatchObject({ reason: "expired" });
    expect(await verifyIdentityCode(a, id, code, ctx)).toMatchObject({ ok: false, reason: "expired" });
  });

  it("only the latest code works after a resend", async () => {
    const { a, id, code: first } = await pending();
    expect(await resendIdentityCode(a, id, ctx)).toEqual({ ok: true });
    const second = latestIdentityCode("other@example.org");
    if (first !== second) expect(await verifyIdentityCode(a, id, first, ctx)).toMatchObject({ ok: false });
    expect(await verifyIdentityCode(a, id, second, ctx)).toEqual({ ok: true });
  });

  it("limits resends to 3 an hour per identity", async () => {
    const { a, id } = await pending();
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await resendIdentityCode(a, id, ctx));
    expect(results[3]).toMatchObject({ ok: false, reason: "rate_limited" });
  });

  it("rejects an expired code", async () => {
    const { a, id, code } = await pending();
    await getAuthDb()
      .collection("identityVerifications")
      .updateOne(
        { identityId: new Types.ObjectId(id) },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );
    expect(await verifyIdentityCode(a, id, code, ctx)).toEqual({ ok: false, reason: "expired" });
  });

  it("handles a double submit of the right code: exactly one success", async () => {
    const { a, id, code } = await pending();
    const results = await Promise.all([
      verifyIdentityCode(a, id, code, ctx),
      verifyIdentityCode(a, id, code, ctx),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
});

describe("reveal", () => {
  it("returns the plaintext only on explicit request, and audits it", async () => {
    const a = actor();
    const added = await addEmailIdentity(a, a.accountEmail, ctx);
    if (!added.ok) throw new Error("setup");
    expect(await revealIdentity(a, added.identityId, ctx)).toEqual({ ok: true, value: "owner@example.com" });
    const audit = await getAuthDb().collection("auditLogs").findOne({ event: "IDENTITY_REVEALED" });
    expect(audit?.metadata).toEqual({ identityId: added.identityId });
    expect(JSON.stringify(await getAuthDb().collection("auditLogs").find({}).toArray())).not.toContain(
      "owner@",
    );
  });

  it("refuses to decrypt a ciphertext moved onto another identity (AAD binding)", async () => {
    const a = actor();
    const one = await addEmailIdentity(a, a.accountEmail, ctx);
    const b = actor("someone@example.net");
    const two = await addEmailIdentity(b, b.accountEmail, ctx);
    if (!one.ok || !two.ok) throw new Error("setup");
    const source = await Identity.findById(one.identityId).lean();
    await getAuthDb()
      .collection("identities")
      .updateOne(
        { _id: new Types.ObjectId(two.identityId) },
        { $set: { valueEncrypted: source!.valueEncrypted } },
      );
    expect(await revealIdentity(b, two.identityId, ctx)).toEqual({ ok: false, reason: "error" });
  });
});
