/**
 * Live check of the HIBP adapter against HIBP's documented test accounts
 * (docs/PROVIDERS.md). Only @hibp-integration-tests.com addresses are ever
 * queried, so it is safe with the free test key and with a paid key.
 *
 * Usage: npm run hibp:smoke                 (3 accounts, the documented test key)
 *        npm run hibp:smoke -- --all        (all 16 documented accounts, ~2 minutes)
 *        npm run hibp:smoke -- --record     (all, and rewrite tests/fixtures/hibp/test-key)
 * HIBP_API_KEY from .env.local is used when set; otherwise the test key.
 */
import { writeFileSync } from "node:fs";
import { brand } from "@/config/brand";
import { HIBP_TEST_API_KEY } from "@/config/env";
import { createHibpProvider, HIBP_BASE_URL } from "@/server/providers/exposure/hibp";

const ACCOUNTS = [
  "account-exists",
  "multiple-breaches",
  "not-active-and-active-breach",
  "not-active-breach",
  "opt-out",
  "opt-out-breach",
  "paste-sensitive-breach",
  "permanent-opt-out",
  "sensitive-and-other-breaches",
  "sensitive-breach",
  "spam-list-only",
  "spam-list-and-others",
  "subscription-free-and-other-breaches",
  "stealer-log",
  "subscription-free-breach",
  "unverified-breach",
];
const QUICK = ["account-exists", "multiple-breaches", "opt-out"];
// Test-key access is rate limited too; stay well under 10 requests a minute.
const PACE_MS = 7_000;

async function main() {
  const record = process.argv.includes("--record");
  const accounts = record || process.argv.includes("--all") ? ACCOUNTS : QUICK;
  const apiKey = process.env.HIBP_API_KEY || HIBP_TEST_API_KEY;
  const userAgent = `${brand.slug}/0.1 (integration smoke test)`;
  console.log(
    `HIBP ${HIBP_BASE_URL}, ${apiKey === HIBP_TEST_API_KEY ? "documented test key" : "key from env"}`,
  );

  let rawFetchStatus = 0;
  let rawBody: unknown;
  // Wraps fetch to keep the raw response for --record; the adapter still does all parsing.
  const recordingFetch: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);
    rawFetchStatus = response.status;
    rawBody = response.status === 200 ? await response.clone().json() : undefined;
    return response;
  };
  const provider = createHibpProvider({ apiKey, userAgent, fetch: recordingFetch });

  let failures = 0;
  for (const [i, alias] of accounts.entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, PACE_MS));
    const result = await provider.search({
      type: "email",
      normalizedValue: `${alias}@hibp-integration-tests.com`,
    });
    if (result.status === "ok") {
      const found =
        result.exposures.map((e) => `${e.providerReference}(${e.sourceType})`).join(", ") || "none";
      console.log(`  ok    ${alias.padEnd(38)} HTTP ${rawFetchStatus}  breaches: ${found}`);
      if (record) {
        writeFileSync(
          `tests/fixtures/hibp/test-key/${alias}.json`,
          `${JSON.stringify(rawFetchStatus === 200 ? { status: 200, body: rawBody } : { status: rawFetchStatus }, null, 2)}\n`,
        );
      }
    } else {
      failures += 1;
      console.log(`  FAIL  ${alias.padEnd(38)} HTTP ${rawFetchStatus}  ${result.category}`);
    }
  }
  if (record)
    console.log("Recorded. Run `npx prettier --write tests/fixtures/hibp/test-key` and the unit tests.");
  process.exitCode = failures > 0 ? 1 : 0;
}

void main();
