import { describe, expect, it } from "vitest";
import { getAuthDb } from "@/lib/db/mongo-client";
import { signIn, signUp } from "@/server/services/account/auth-service";
import { ctx, setupAuthHarness } from "../integration/helpers/auth-harness";

setupAuthHarness();

describe("auth hardening", () => {
  it("mounts no Better Auth HTTP surface: credential flows only run through rate-limited Server Actions (D-018)", async () => {
    const { readdir } = await import("node:fs/promises");
    const files = await readdir("app", { recursive: true });
    const routes = files.filter((f) => /(^|\/)route\.(ts|tsx|js)$/.test(f));
    expect(routes.filter((r) => r.includes("api/auth"))).toEqual([]);
  });

  it("enforces the 12-character minimum inside the auth library too, not only in the form", async () => {
    expect(await signUp({ email: "short@example.com", password: "elevenchars" }, ctx())).toMatchObject({
      ok: false,
    });
    expect(await getAuthDb().collection("user").countDocuments()).toBe(0);
  });

  it("treats operator-shaped strings as plain data", async () => {
    const result = await signIn({ email: '{"$ne":null}@example.com', password: '{"$gt":""}' }, ctx());
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });
});
