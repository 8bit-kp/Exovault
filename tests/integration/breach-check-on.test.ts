// With the breach check on, Better Auth's plugin wraps the context's password hasher so it only
// works inside an auth endpoint call. These paths hash outside one and must not depend on it.
process.env.PASSWORD_BREACH_CHECK = "on";

import { describe, expect, it } from "vitest";
import { getAuthDb } from "@/lib/db/mongo-client";
import { signUp } from "@/server/services/account/auth-service";
import { ctx, setupAuthHarness } from "./helpers/auth-harness";

setupAuthHarness();

describe("password hashing outside auth endpoints, with PASSWORD_BREACH_CHECK=on", () => {
  it("answers a sign-up for an existing unverified address (timing-equalising hash)", async () => {
    await getAuthDb().collection("user").insertOne({
      email: "pending.person@example.com",
      emailVerified: false,
      name: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(
      await signUp({ email: "pending.person@example.com", password: "a long enough password" }, ctx()),
    ).toEqual({
      ok: true,
      nonce: null,
    });
  });
});
