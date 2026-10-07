import { createHash } from "node:crypto";
import type {
  ExposureProvider,
  ProviderExposure,
  ProviderSearchResult,
  SearchIdentifier,
} from "../interface";
import { MOCK_BREACHES, MOCK_CONTOSO_FROM_SECOND_PROVIDER } from "./catalog";

/**
 * Deterministic mock providers (spec 7.2). No network, no randomness: the same
 * input always gives the same output, so tests and demos are reproducible.
 */
export const MOCK_SCENARIOS = [
  "clean",
  "single",
  "multiple",
  "duplicate",
  "failing",
  "partial-failure",
  "slow-timeout",
] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

const ok = (exposures: ProviderExposure[]): ProviderSearchResult => ({
  status: "ok",
  exposures,
  checkedAt: new Date(),
});

function base(name: string, search: ExposureProvider["search"], displayName?: string): ExposureProvider {
  return {
    getName: () => name,
    getCapabilities: () => ({
      displayName,
      identifierTypes: ["email"],
      rateLimit: { requests: 600, windowMs: 60_000 },
      isDemo: true,
    }),
    search,
  };
}

/** One provider with a fixed behaviour, for engine and contract tests. */
export function createMockProvider(scenario: MockScenario, name = `mock-${scenario}`): ExposureProvider {
  return base(name, async (identifier: SearchIdentifier, ctx) => {
    switch (scenario) {
      case "clean":
        return ok([]);
      case "single":
        return ok([MOCK_BREACHES.contoso]);
      case "multiple":
        return ok([
          MOCK_BREACHES.northwind,
          MOCK_BREACHES.contoso,
          MOCK_BREACHES.lunaDating,
          MOCK_BREACHES.fabrikam,
        ]);
      case "duplicate":
        // The same breach twice in one response, as some aggregators return it.
        return ok([MOCK_BREACHES.contoso, { ...MOCK_BREACHES.contoso }, MOCK_CONTOSO_FROM_SECOND_PROVIDER]);
      case "failing":
        return { status: "error", category: "unavailable", retryable: true };
      case "partial-failure":
        // Fails for some identifiers and not others: half of a multi-provider scan.
        return hashByte(identifier.normalizedValue) % 2 === 0
          ? ok([MOCK_BREACHES.fabrikam])
          : { status: "error", category: "rate_limited", retryable: true, retryAfterMs: 1_000 };
      case "slow-timeout":
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 60_000);
          ctx?.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
          });
        }).catch(() => undefined);
        return { status: "error", category: "timeout", retryable: true };
    }
  });
}

function hashByte(value: string): number {
  return createHash("sha256").update(value).digest()[0];
}

/**
 * Demo-mode providers (PROVIDER_MODE=mock): two "sources" whose answers depend
 * deterministically on the address, so demos show every state.
 *  - local part contains "clean"   → no exposures
 *  - contains "fail"               → both sources fail (scan FAILED)
 *  - contains "partial"            → second source fails (scan PARTIAL)
 *  - contains "slow"               → first source times out
 *  - contains "sensitive"          → includes a sensitive (dating-site) source
 *  - anything else                 → a hash-chosen subset of the fictional catalog
 */
export function createDemoProviders(): ExposureProvider[] {
  const local = (identifier: SearchIdentifier) => identifier.normalizedValue.split("@")[0];
  const entries = Object.values(MOCK_BREACHES);
  const primary = base(
    "demo-breach-index",
    async (identifier, ctx) => {
      const name = local(identifier);
      if (name.includes("clean")) return ok([]);
      if (name.includes("fail")) return { status: "error", category: "unavailable", retryable: true };
      if (name.includes("slow")) return createMockProvider("slow-timeout").search(identifier, ctx);
      if (name.includes("sensitive")) return ok([MOCK_BREACHES.northwind, MOCK_BREACHES.lunaDating]);
      const byte = hashByte(identifier.normalizedValue);
      // Always at least two, deterministic per address.
      const count = 2 + (byte % (entries.length - 1));
      const start = byte % entries.length;
      return ok(Array.from({ length: count }, (_, i) => entries[(start + i) % entries.length]));
    },
    "Demo breach index",
  );
  const secondary = base(
    "demo-credential-watch",
    async (identifier) => {
      const name = local(identifier);
      if (name.includes("clean")) return ok([]);
      if (name.includes("fail") || name.includes("partial")) {
        return { status: "error", category: "unavailable", retryable: true };
      }
      return ok(hashByte(identifier.normalizedValue) % 3 === 0 ? [] : [MOCK_CONTOSO_FROM_SECOND_PROVIDER]);
    },
    "Demo credential watch",
  );
  return [primary, secondary];
}
