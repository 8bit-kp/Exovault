import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { Identity } from "@/models/Identity";
import {
  addEmailIdentity,
  getIdentity,
  listIdentities,
  removeIdentity,
  resendIdentityCode,
  revealIdentity,
  verifyIdentityCode,
  type Actor,
} from "@/server/services/identity/identity-service";
import { latestIdentityCode, setupAuthHarness } from "../integration/helpers/auth-harness";

setupAuthHarness();

const ctx = { ip: "203.0.113.20", requestId: "req-idor" };
const user = (email: string): Actor => ({
  userId: new Types.ObjectId().toHexString(),
  accountEmail: email,
  accountEmailVerified: true,
});

/**
 * IDOR matrix (spec 12.1, 14.3): user B, holding user A's real identity ID,
 * gets "not found" from every operation, and A's data is unchanged.
 */
describe("identity IDOR matrix", () => {
  async function victimIdentity() {
    const alice = user("alice@example.com");
    const added = await addEmailIdentity(alice, "alice.other@example.org", ctx);
    if (!added.ok) throw new Error("setup");
    return { alice, id: added.identityId, code: latestIdentityCode("alice.other@example.org") };
  }

  it("get / list", async () => {
    const { id } = await victimIdentity();
    const bob = user("bob@example.com");
    expect(await getIdentity(bob.userId, id)).toBeNull();
    expect(await listIdentities(bob.userId)).toEqual([]);
  });

  it("reveal", async () => {
    const { id } = await victimIdentity();
    expect(await revealIdentity(user("bob@example.com"), id, ctx)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("verify, even with the correct code", async () => {
    const { id, code } = await victimIdentity();
    expect(await verifyIdentityCode(user("bob@example.com"), id, code, ctx)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect((await Identity.findById(id).lean())?.verificationStatus).toBe("pending");
  });

  it("resend", async () => {
    const { id } = await victimIdentity();
    expect(await resendIdentityCode(user("bob@example.com"), id, ctx)).toEqual({
      ok: false,
      reason: "not_found",
    });
  });

  it("remove", async () => {
    const { id } = await victimIdentity();
    expect(await removeIdentity(user("bob@example.com"), id, ctx)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await Identity.countDocuments({ _id: id })).toBe(1);
  });

  it("malformed and injection-shaped IDs are simply not found", async () => {
    const bob = user("bob@example.com");
    for (const bad of ["", "123", "zzzzzzzzzzzzzzzzzzzzzzzz", '{"$ne":null}', "../../etc", "0".repeat(24)]) {
      expect(await getIdentity(bob.userId, bad)).toBeNull();
      expect(await removeIdentity(bob, bad, ctx)).toEqual({ ok: false, reason: "not_found" });
      expect(await revealIdentity(bob, bad, ctx)).toEqual({ ok: false, reason: "not_found" });
    }
  });

  it("the same address can be monitored by two users only if each proves ownership", async () => {
    await victimIdentity();
    const bob = user("bob@example.com");
    const bobs = await addEmailIdentity(bob, "alice.other@example.org", ctx);
    expect(bobs).toMatchObject({ ok: true, verification: "pending" });
  });
});
