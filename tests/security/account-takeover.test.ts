import { describe, expect, it } from "vitest";
import { getAuthDb } from "@/lib/db/mongo-client";
import {
  requestPasswordReset,
  resendVerificationCode,
  resetPassword,
  signIn,
  signUp,
  verifyEmailCode,
} from "@/server/services/account/auth-service";
import {
  ctx,
  flushBackground,
  latestCode,
  latestResetToken,
  outbox,
  setupAuthHarness,
} from "../integration/helpers/auth-harness";

/**
 * D-034: email verification is bound to the sign-up (or password sign-in)
 * that set the account's password.
 */
setupAuthHarness();

const nonceOf = (result: unknown) => (result as { nonce?: string | null }).nonce ?? null;
const victim = "victim@example.com";

describe("pre-account hijacking", () => {
  it("an attacker who pre-registers the victim's address never ends up with a verified account they control", async () => {
    // 1. Attacker registers the victim's address with a password they know.
    const attacker = await signUp({ email: victim, password: "attacker-knows-this-pw" }, ctx());
    expect(attacker).toMatchObject({ ok: true });
    await flushBackground();
    const attackerCode = latestCode(victim); // lands in the victim's mailbox

    // 2. The victim signs up later: same response, but no code. A set-password link instead.
    outbox.clear();
    const victimSignUp = await signUp({ email: victim, password: "victims-own-password" }, ctx());
    expect(victimSignUp).toEqual({ ok: true, nonce: null });
    await flushBackground();
    expect(outbox.outbox.map((m) => m.kind)).toEqual(["reset-password"]);
    const token = latestResetToken(victim);

    // 3. Neither the attacker's code nor a resend can verify from the victim's (unbound) browser.
    expect(await verifyEmailCode({ email: victim, code: attackerCode, nonce: null }, ctx())).toEqual({
      ok: false,
      reason: "invalid",
    });
    outbox.clear();
    await resendVerificationCode({ email: victim, nonce: null }, ctx());
    await flushBackground();
    expect(outbox.outbox.filter((m) => m.kind === "verify-email")).toHaveLength(0);
    expect((await getAuthDb().collection("user").findOne({ email: victim }))?.emailVerified).toBe(false);

    // 4. The victim uses the link: account verified, attacker's password replaced.
    expect(await resetPassword({ token, password: "victims-own-password" }, ctx())).toEqual({ ok: true });
    expect((await getAuthDb().collection("user").findOne({ email: victim }))?.emailVerified).toBe(true);
    expect(await signIn({ email: victim, password: "attacker-knows-this-pw" }, ctx())).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(await signIn({ email: victim, password: "victims-own-password" }, ctx())).toEqual({ ok: true });
  });

  it("only the browser bound to the sign-up can verify with the code", async () => {
    const up = await signUp({ email: "owner@example.com", password: "owner-password-123" }, ctx());
    await flushBackground();
    const code = latestCode("owner@example.com");
    expect(
      await verifyEmailCode({ email: "owner@example.com", code, nonce: "forged-nonce-value" }, ctx()),
    ).toMatchObject({
      ok: false,
    });
    expect(await verifyEmailCode({ email: "owner@example.com", code, nonce: nonceOf(up) }, ctx())).toEqual({
      ok: true,
    });
  });

  it("a correct password re-binds a new browser to an unverified account", async () => {
    await signUp({ email: "later@example.com", password: "later-password-123" }, ctx());
    await flushBackground();
    outbox.clear();
    const signedIn = await signIn({ email: "later@example.com", password: "later-password-123" }, ctx());
    expect(signedIn).toMatchObject({ ok: true, next: "verify-email" });
    await flushBackground();
    const code = latestCode("later@example.com");
    expect(
      await verifyEmailCode({ email: "later@example.com", code, nonce: nonceOf(signedIn) }, ctx()),
    ).toEqual({
      ok: true,
    });
  });
});

describe("codes never sign into a verified account", () => {
  it("no code is sent or accepted for an already-verified address", async () => {
    const up = await signUp({ email: "done@example.com", password: "done-password-1234" }, ctx());
    await flushBackground();
    await verifyEmailCode(
      { email: "done@example.com", code: latestCode("done@example.com"), nonce: nonceOf(up) },
      ctx(),
    );

    outbox.clear();
    const again = await signUp({ email: "done@example.com", password: "attacker-password-1" }, ctx());
    expect(again).toEqual({ ok: true, nonce: null });
    await resendVerificationCode({ email: "done@example.com", nonce: null }, ctx());
    await resendVerificationCode({ email: "done@example.com", nonce: nonceOf(up) }, ctx());
    await flushBackground();
    expect(outbox.outbox.filter((m) => m.kind === "verify-email")).toHaveLength(0);
    expect(outbox.outbox.map((m) => m.kind)).toEqual(["account-exists"]);
  });

  it("a completed password reset is mailbox proof: it verifies the account", async () => {
    await signUp({ email: "proof@example.com", password: "proof-password-123" }, ctx());
    await flushBackground();
    await requestPasswordReset({ email: "proof@example.com" }, ctx());
    await flushBackground();
    await resetPassword(
      { token: latestResetToken("proof@example.com"), password: "new-proof-password" },
      ctx(),
    );
    expect(await signIn({ email: "proof@example.com", password: "new-proof-password" }, ctx())).toEqual({
      ok: true,
    });
  });
});
