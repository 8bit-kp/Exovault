import { describe, expect, it } from "vitest";
import { getAuth } from "@/lib/auth/server";
import { getAuthDb } from "@/lib/db/mongo-client";
import {
  requestPasswordReset,
  resetPassword,
  signIn,
  signOut,
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
} from "./helpers/auth-harness";

setupAuthHarness();

const PASSWORD = "correct horse battery staple";

async function registeredAndVerified(email: string) {
  expect(await signUp({ email, password: PASSWORD }, ctx())).toEqual({ ok: true });
  await flushBackground();
  expect(await verifyEmailCode({ email, code: latestCode(email) }, ctx())).toEqual({ ok: true });
}

describe("sign-up and email verification", () => {
  it("creates an unverified account, emails a code, and verifies with it", async () => {
    expect(await signUp({ email: "ana@example.com", password: PASSWORD }, ctx())).toEqual({ ok: true });
    await flushBackground();
    const user = await getAuthDb().collection("user").findOne({ email: "ana@example.com" });
    expect(user?.emailVerified).toBe(false);

    const code = latestCode("ana@example.com");
    expect(await verifyEmailCode({ email: "ana@example.com", code }, ctx())).toEqual({ ok: true });
    const after = await getAuthDb().collection("user").findOne({ email: "ana@example.com" });
    expect(after?.emailVerified).toBe(true);
  });

  it("stores the verification code hashed, never in clear", async () => {
    await signUp({ email: "ana@example.com", password: PASSWORD }, ctx());
    await flushBackground();
    const code = latestCode("ana@example.com");
    const rows = await getAuthDb().collection("verification").find({}).toArray();
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain(code);
  });

  it("accepts a code once only", async () => {
    await signUp({ email: "ana@example.com", password: PASSWORD }, ctx());
    await flushBackground();
    const code = latestCode("ana@example.com");
    expect((await verifyEmailCode({ email: "ana@example.com", code }, ctx())).ok).toBe(true);
    expect((await verifyEmailCode({ email: "ana@example.com", code }, ctx())).ok).toBe(false);
  });

  it("burns the code after three wrong guesses", async () => {
    await signUp({ email: "ana@example.com", password: PASSWORD }, ctx());
    await flushBackground();
    const code = latestCode("ana@example.com");
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 3; i++) await verifyEmailCode({ email: "ana@example.com", code: wrong }, ctx());
    expect(await verifyEmailCode({ email: "ana@example.com", code }, ctx())).toMatchObject({ ok: false });
  });

  it("gives the same answer for an existing address and emails the owner instead (no enumeration)", async () => {
    await registeredAndVerified("ana@example.com");
    outbox.clear();
    const second = await signUp({ email: "ana@example.com", password: "a different long password" }, ctx());
    expect(second).toEqual({ ok: true });
    await flushBackground();
    expect(outbox.outbox.map((m) => m.kind)).toEqual(["account-exists"]);
    expect(await getAuthDb().collection("user").countDocuments({ email: "ana@example.com" })).toBe(1);
  });

  it("stores no plaintext password", async () => {
    await signUp({ email: "ana@example.com", password: PASSWORD }, ctx());
    const dump = JSON.stringify(await getAuthDb().collection("account").find({}).toArray());
    expect(dump).not.toContain(PASSWORD);
  });
});

describe("sign-in", () => {
  it("signs in a verified user and creates a server-side session", async () => {
    await registeredAndVerified("ana@example.com");
    const before = await getAuthDb().collection("session").countDocuments();
    expect(await signIn({ email: "ana@example.com", password: PASSWORD }, ctx())).toEqual({ ok: true });
    expect(await getAuthDb().collection("session").countDocuments()).toBe(before + 1);
  });

  it("returns the same failure for a wrong password and an unknown account", async () => {
    await registeredAndVerified("ana@example.com");
    const wrongPassword = await signIn(
      { email: "ana@example.com", password: "not the password at all" },
      ctx(),
    );
    const unknown = await signIn({ email: "nobody@example.com", password: "not the password at all" }, ctx());
    expect(wrongPassword).toEqual({ ok: false, reason: "invalid" });
    expect(unknown).toEqual(wrongPassword);
  });

  it("sends an unverified owner (correct password) to verification with a fresh code", async () => {
    await signUp({ email: "ana@example.com", password: PASSWORD }, ctx());
    await flushBackground();
    outbox.clear();
    expect(await signIn({ email: "ana@example.com", password: PASSWORD }, ctx())).toEqual({
      ok: true,
      next: "verify-email",
    });
    await flushBackground();
    expect(latestCode("ana@example.com")).toMatch(/^\d{6}$/);
  });

  it("records success and failure in the audit log without the email", async () => {
    await registeredAndVerified("ana@example.com");
    await signIn({ email: "ana@example.com", password: "wrong password here" }, ctx());
    await signIn({ email: "ana@example.com", password: PASSWORD }, ctx());
    const events = await getAuthDb().collection("auditLogs").find({}).toArray();
    const names = events.map((e) => e.event);
    expect(names).toEqual(
      expect.arrayContaining(["USER_CREATED", "EMAIL_VERIFIED", "LOGIN_FAILED", "LOGIN_SUCCESS"]),
    );
    expect(JSON.stringify(events)).not.toContain("ana@example.com");
  });
});

describe("sessions", () => {
  it("sign-out deletes the session server-side", async () => {
    await registeredAndVerified("ana@example.com");
    const { headers } = await getAuth().api.signInEmail({
      body: { email: "ana@example.com", password: PASSWORD },
      headers: ctx().headers,
      returnHeaders: true,
    });
    const cookie = headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    expect(await getAuth().api.getSession({ headers: new Headers({ cookie }) })).not.toBeNull();

    await signOut(ctx({ cookie }), null);
    expect(await getAuth().api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  });

  it("issues an httpOnly, SameSite=Lax session cookie and never stores the client IP", async () => {
    await registeredAndVerified("ana@example.com");
    const { headers } = await getAuth().api.signInEmail({
      body: { email: "ana@example.com", password: PASSWORD },
      headers: ctx().headers,
      returnHeaders: true,
    });
    const sessionCookie = headers.getSetCookie().find((c) => c.includes("session_token"))!;
    expect(sessionCookie).toMatch(/HttpOnly/i);
    expect(sessionCookie).toMatch(/SameSite=Lax/i);
    expect(sessionCookie.startsWith("exovault.session_token=")).toBe(true);
    const sessions = await getAuthDb().collection("session").find({}).toArray();
    for (const s of sessions) expect(s.ipAddress ?? "").toBe("");
  });
});

describe("password reset", () => {
  it("answers the same for unknown addresses and sends nothing", async () => {
    expect(await requestPasswordReset({ email: "nobody@example.com" }, ctx())).toEqual({ ok: true });
    await flushBackground();
    expect(outbox.outbox).toHaveLength(0);
  });

  it("resets with a single-use, hashed-at-rest token and revokes every session", async () => {
    await registeredAndVerified("ana@example.com");
    await signIn({ email: "ana@example.com", password: PASSWORD }, ctx());
    expect(await getAuthDb().collection("session").countDocuments()).toBeGreaterThan(0);

    await requestPasswordReset({ email: "ana@example.com" }, ctx());
    await flushBackground();
    const token = latestResetToken("ana@example.com");
    const stored = JSON.stringify(await getAuthDb().collection("verification").find({}).toArray());
    expect(stored).not.toContain(token);

    const newPassword = "an entirely new passphrase";
    expect(await resetPassword({ token, password: newPassword }, ctx())).toEqual({ ok: true });
    expect(await getAuthDb().collection("session").countDocuments()).toBe(0);
    expect(await resetPassword({ token, password: "yet another passphrase!" }, ctx())).toEqual({
      ok: false,
      reason: "expired",
    });
    expect(await signIn({ email: "ana@example.com", password: newPassword }, ctx())).toEqual({ ok: true });
    await flushBackground();
    expect(outbox.outbox.some((m) => m.kind === "password-changed")).toBe(true);
  });
});

describe("database constraints", () => {
  it("enforces one account per email at the database level, not just in application code", async () => {
    await signUp({ email: "ana@example.com", password: PASSWORD }, ctx());
    await expect(
      getAuthDb().collection("user").insertOne({ email: "ana@example.com", emailVerified: false }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it("expires sessions and verification rows via TTL indexes", async () => {
    const ttl = async (name: string) =>
      (await getAuthDb().collection(name).indexes()).find((i) => i.expireAfterSeconds === 0)?.key;
    expect(await ttl("session")).toEqual({ expiresAt: 1 });
    expect(await ttl("verification")).toEqual({ expiresAt: 1 });
  });
});
