import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { EXPOSED_DATA_TYPES, EXPOSURE_SOURCE_TYPES } from "@/lib/domain/exposure";
import { createHibpProvider, HIBP_BASE_URL } from "@/server/providers/exposure/hibp";
import { mapHibpDataClass } from "@/server/providers/exposure/hibp/data-classes";
import {
  PROVIDER_ERROR_CATEGORIES,
  type ExposureProvider,
  type SearchIdentifier,
} from "@/server/providers/exposure/interface";
import { createDemoProviders, createMockProvider, MOCK_SCENARIOS } from "@/server/providers/exposure/mock";

const fixture = (name: string) => JSON.parse(readFileSync(`tests/fixtures/hibp/${name}.json`, "utf8"));
const breach = (name: string) => fixture(`breach-${name}`);

/** A fetch that replays a recorded response, and records the request it got. */
function replay(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return vi.fn<typeof fetch>(
    async () =>
      new Response(body === undefined ? null : typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
      }),
  );
}

const hibpWith = (fetchImpl: typeof fetch) =>
  createHibpProvider({
    apiKey: "0".repeat(32),
    userAgent: "Exovault-tests/1.0",
    fetch: fetchImpl,
    timeoutMs: 200,
  });

/* ------------------------------------------------------------------ */
/* The contract every provider must satisfy                           */
/* ------------------------------------------------------------------ */

const exposureSchema = z
  .object({
    providerReference: z.string().min(1).optional(),
    sourceName: z.string().min(1).max(300),
    sourceType: z.enum(EXPOSURE_SOURCE_TYPES),
    breachDate: z.date().optional(),
    addedToProviderAt: z.date().optional(),
    exposedDataTypes: z.array(z.enum(EXPOSED_DATA_TYPES)),
    isSensitiveSource: z.boolean(),
    confidence: z.number().min(0).max(1),
    evidenceReference: z.url({ protocol: /^https$/ }).optional(),
  })
  .strict(); // no severity, discoveredAt, raw data or anything else (D-006)

const resultSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), exposures: z.array(exposureSchema), checkedAt: z.date() }).strict(),
  z
    .object({
      status: z.literal("error"),
      category: z.enum(PROVIDER_ERROR_CATEGORIES),
      retryable: z.boolean(),
      retryAfterMs: z.number().positive().optional(),
    })
    .strict(),
]);

const identifiers: SearchIdentifier[] = [
  { type: "email", normalizedValue: "ana@example.org" },
  { type: "email", normalizedValue: "bo.b+tag@example.net" },
  { type: "email", normalizedValue: "clean-person@example.org" },
];

const providers: Array<[string, () => ExposureProvider]> = [
  ...MOCK_SCENARIOS.map(
    (s) => [`mock:${s}`, () => createMockProvider(s)] as [string, () => ExposureProvider],
  ),
  ["demo:breach-index", () => createDemoProviders()[0]],
  ["demo:credential-watch", () => createDemoProviders()[1]],
  [
    "hibp:multiple",
    () =>
      hibpWith(
        replay(
          200,
          ["Adobe", "LinkedIn", "AshleyMadison", "June2026StealerLogs", "Acuity", "Zoosk"].map(breach),
        ),
      ),
  ],
  ["hibp:not-pwned", () => hibpWith(replay(404))],
  ["hibp:rate-limited", () => hibpWith(replay(429, "", { "retry-after": "3" }))],
];

describe.each(providers)("provider contract: %s", (_label, make) => {
  it("describes itself", () => {
    const provider = make();
    expect(provider.getName()).toMatch(/^[a-z0-9-]+$/);
    const capabilities = provider.getCapabilities();
    expect(capabilities.identifierTypes).toContain("email");
    expect(capabilities.rateLimit.requests).toBeGreaterThan(0);
    expect(capabilities.rateLimit.windowMs).toBeGreaterThan(0);
  });

  it("returns a well-formed result, never echoing the identifier back", async () => {
    for (const identifier of identifiers) {
      const result = await make().search(identifier, { signal: AbortSignal.timeout(300) });
      expect(resultSchema.safeParse(result).error?.issues ?? []).toEqual([]);
      expect(JSON.stringify(result)).not.toContain(identifier.normalizedValue);
    }
  });

  it("is deterministic for the same input", async () => {
    const strip = (r: unknown) =>
      JSON.parse(JSON.stringify(r, (k, v) => (k === "checkedAt" ? undefined : v)));
    const identifier = identifiers[0];
    const a = await make().search(identifier, { signal: AbortSignal.timeout(300) });
    const b = await make().search(identifier, { signal: AbortSignal.timeout(300) });
    expect(strip(a)).toEqual(strip(b));
  });
});

/* ------------------------------------------------------------------ */
/* HIBP: request shape, mapping, error mapping                        */
/* ------------------------------------------------------------------ */

describe("HIBP adapter", () => {
  const who: SearchIdentifier = { type: "email", normalizedValue: "ana+x@example.org" };

  it("calls only the documented endpoint, with key, User-Agent, and the address percent-encoded", async () => {
    const fetchImpl = replay(404);
    await hibpWith(fetchImpl).search(who);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(`${HIBP_BASE_URL}/breachedAccount/ana%2Bx%40example.org?truncateResponse=false`);
    const headers = new Headers(init?.headers);
    expect(headers.get("hibp-api-key")).toBe("0".repeat(32));
    expect(headers.get("user-agent")).toBe("Exovault-tests/1.0");
    expect(init?.redirect).toBe("error");
  });

  it("maps recorded breach models onto our vocabulary", async () => {
    const result = await hibpWith(
      replay(200, ["Adobe", "AshleyMadison", "June2026StealerLogs", "Acuity"].map(breach)),
    ).search(who);
    if (result.status !== "ok") throw new Error("expected ok");
    const [adobe, ashley, stealer, acuity] = result.exposures;
    expect(adobe).toMatchObject({
      providerReference: "Adobe",
      sourceName: "Adobe",
      sourceType: "breach",
      exposedDataTypes: ["email", "other", "password_hash", "username"],
      isSensitiveSource: false,
      confidence: 0.95,
      evidenceReference: "https://haveibeenpwned.com/Breach/Adobe",
    });
    expect(adobe.breachDate?.toISOString()).toBe("2013-10-04T00:00:00.000Z");
    expect(ashley.isSensitiveSource).toBe(true);
    expect(ashley.exposedDataTypes).toEqual(
      expect.arrayContaining(["security_qa", "financial", "physical_address"]),
    );
    expect(stealer.sourceType).toBe("stealer_log");
    expect(acuity).toMatchObject({ sourceType: "other", confidence: 0.5 }); // spam list
  });

  it("drops fabricated and retired breaches", async () => {
    const retired = { ...breach("Canva"), IsRetired: true };
    const result = await hibpWith(replay(200, [breach("Zoosk"), retired, breach("LinkedIn")])).search(who);
    expect(result.status === "ok" && result.exposures.map((e) => e.providerReference)).toEqual(["LinkedIn"]);
  });

  it("never stores HIBP's HTML description", async () => {
    const result = await hibpWith(replay(200, [breach("Adobe")])).search(who);
    expect(JSON.stringify(result)).not.toContain("<em>");
  });

  it.each([
    [401, "unauthorized", false],
    [403, "unauthorized", false],
    [400, "invalid_response", false],
    [503, "unavailable", true],
    [500, "unavailable", true],
    [418, "unavailable", false],
  ])("maps HTTP %i to %s (retryable: %s)", async (status, category, retryable) => {
    expect(await hibpWith(replay(status, "")).search(who)).toEqual({ status: "error", category, retryable });
  });

  it("honours Retry-After on 429", async () => {
    expect(await hibpWith(replay(429, "", { "retry-after": "7" })).search(who)).toEqual({
      status: "error",
      category: "rate_limited",
      retryable: true,
      retryAfterMs: 7_000,
    });
  });

  it("treats malformed or unexpected bodies as invalid_response", async () => {
    expect(await hibpWith(replay(200, "{not json")).search(who)).toMatchObject({
      category: "invalid_response",
    });
    expect(await hibpWith(replay(200, [{ Name: "x" }])).search(who)).toMatchObject({
      category: "invalid_response",
    });
    expect(await hibpWith(replay(200, { breaches: [] })).search(who)).toMatchObject({
      category: "invalid_response",
    });
  });

  it("maps network failures and timeouts", async () => {
    const network = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await hibpWith(network).search(who)).toEqual({
      status: "error",
      category: "unavailable",
      retryable: true,
    });
    const hang = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
        ),
    );
    expect(await hibpWith(hang).search(who)).toEqual({
      status: "error",
      category: "timeout",
      retryable: true,
    });
  });

  it("credits HIBP as its licence requires", () => {
    expect(hibpWith(replay(404)).getCapabilities().attribution).toEqual({
      name: "Have I Been Pwned",
      url: "https://haveibeenpwned.com",
    });
  });

  it("maps every security-relevant HIBP data class explicitly (recorded data class list)", () => {
    const classes: string[] = fixture("dataclasses");
    const mustMap: Record<string, string> = {
      "Email addresses": "email",
      Passwords: "password_hash",
      "Auth tokens": "auth_token",
      "Security questions and answers": "security_qa",
      "Credit cards": "financial",
      "Bank account numbers": "financial",
      "Government issued IDs": "government_id",
      "Passport numbers": "government_id",
      "Social security numbers": "government_id",
      "Physical addresses": "physical_address",
      "Phone numbers": "phone",
      "Dates of birth": "date_of_birth",
      "IP addresses": "ip_address",
    };
    for (const [dataClass, expected] of Object.entries(mustMap)) {
      expect(classes).toContain(dataClass);
      expect(mapHibpDataClass(dataClass)).toBe(expected);
    }
    // Everything else lands somewhere in our vocabulary.
    for (const dataClass of classes) expect(EXPOSED_DATA_TYPES).toContain(mapHibpDataClass(dataClass));
  });
});
