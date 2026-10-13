// With the breach check on, Better Auth's plugin wraps the context's password hasher so it only
// works inside an auth endpoint call. These paths hash outside one and must not depend on it.
process.env.PASSWORD_BREACH_CHECK = "on";

import { describe, expect, it } from "vitest";
import { getAuthDb } from "@/lib/db/mongo-client";
import { signIn, signUp } from "@/server/services/account/auth-service";
import { provisionDemoAccount } from "@/server/services/demo/demo-account";
import { ctx, setupAuthHarness } from "./helpers/auth-harness";

setupAuthHarness();

describe("password hashing outside auth endpoints, with PASSWORD_BREACH_CHECK=on", () => {
  it("sets the demo account's password (seed / daily reset)", async () => {
    const email = "demo.check@exovault.example";
    // First call creates the account through the sign-up endpoint, which would call the breach API:
    // create it directly instead, as an existing account whose password the seed then sets.
    const userId = (
      await getAuthDb().collection("user").insertOne({
        email,
        emailVerified: true,
        name: "",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    ).insertedId;
    await getAuthDb().collection("account").insertOne({
      userId,
      accountId: userId.toHexString(),
      providerId: "credential",
      password: "placeholder",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await provisionDemoAccount(email, "exovault-demo-2026");
    expect((await signIn({ email, password: "exovault-demo-2026" }, ctx())).ok).toBe(true);
  });

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
