import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { HIBP_TEST_API_KEY } from "@/config/env";
import { createHibpProvider } from "@/server/providers/exposure/hibp";

/**
 * Replays responses recorded from the live HIBP API on 2026-10-27 with the
 * documented test key, for the documented @hibp-integration-tests.com
 * accounts (docs/PROVIDERS.md). Re-record with `npm run hibp:smoke -- --record`.
 */
const DIR = "tests/fixtures/hibp/test-key";
const recorded = (alias: string): { status: number; body?: unknown } =>
  JSON.parse(readFileSync(`${DIR}/${alias}.json`, "utf8"));

const hibpReplaying = (alias: string) => {
  const { status, body } = recorded(alias);
  const fetchImpl = vi.fn<typeof fetch>(
    async () =>
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
  const provider = createHibpProvider({
    apiKey: HIBP_TEST_API_KEY,
    userAgent: "consltek-breach-monitoring-tests/1.0",
    fetch: fetchImpl,
  });
  return {
    fetchImpl,
    search: () => provider.search({ type: "email", normalizedValue: `${alias}@hibp-integration-tests.com` }),
  };
};

const names = async (alias: string) => {
  const result = await hibpReplaying(alias).search();
  if (result.status !== "ok") throw new Error(`expected ok for ${alias}, got ${JSON.stringify(result)}`);
  return result.exposures.map((e) => e.providerReference);
};

describe("HIBP test-key responses (recorded)", () => {
  it("has a recording for every documented test account", () => {
    expect(readdirSync(DIR).length).toBe(16);
  });

  it("every recording parses through the real adapter without an error", async () => {
    for (const file of readdirSync(DIR)) {
      const result = await hibpReplaying(file.replace(/\.json$/, "")).search();
      expect(result.status, file).toBe("ok");
    }
  });

  it("account-exists returns one breach (its paste is not fetched: we only call breachedAccount)", async () => {
    expect(await names("account-exists")).toEqual(["Adobe"]);
  });

  it("multiple-breaches returns three", async () => {
    expect(await names("multiple-breaches")).toEqual(["Adobe", "Stratfor", "Gawker"]);
  });

  it("opted-out and inactive-only accounts come back as a clean 404, i.e. no findings", async () => {
    for (const alias of ["opt-out", "permanent-opt-out", "not-active-breach", "sensitive-breach"]) {
      expect(await names(alias), alias).toEqual([]);
    }
  });

  it("spam lists get the lower spam-list confidence", async () => {
    const result = await hibpReplaying("spam-list-only").search();
    expect(result.status === "ok" && result.exposures[0]).toMatchObject({
      sourceType: "other",
      confidence: 0.5,
    });
  });

  it("stealer logs and unverified breaches are mapped as such", async () => {
    const stealer = await hibpReplaying("stealer-log").search();
    expect(stealer.status === "ok" && stealer.exposures[0].sourceType).toBe("stealer_log");
    const unverified = await hibpReplaying("unverified-breach").search();
    expect(unverified.status === "ok" && unverified.exposures[0].confidence).toBe(0.6);
  });

  it("sends the test key and our User-Agent on the documented endpoint", async () => {
    const { fetchImpl, search } = hibpReplaying("account-exists");
    await search();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(
      "https://haveibeenpwned.com/api/v3/breachedAccount/account-exists%40hibp-integration-tests.com?truncateResponse=false",
    );
    const headers = new Headers(init?.headers);
    expect(headers.get("hibp-api-key")).toBe(HIBP_TEST_API_KEY);
    expect(headers.get("user-agent")).toMatch(/^consltek-breach-monitoring/);
  });

  it("a real address with the test key is HIBP's 401, reported as a provider failure (not 'no findings')", async () => {
    const provider = createHibpProvider({
      apiKey: HIBP_TEST_API_KEY,
      userAgent: "t",
      // Body recorded from the live API for a non-test address.
      fetch: async () =>
        new Response(
          JSON.stringify({
            statusCode: 401,
            message:
              "Access denied due to invalid subscription key. Make sure to provide a valid key for an active subscription.",
          }),
          { status: 401 },
        ),
    });
    expect(await provider.search({ type: "email", normalizedValue: "someone@example.com" })).toEqual({
      status: "error",
      category: "unauthorized",
      retryable: false,
    });
  });
});
