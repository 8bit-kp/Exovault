# Exposure providers

> Status: **Phase 5.** Built: the provider contract, demo/mock providers, and the HIBP adapter (contract-tested against recorded fixtures; never run live in tests).

## Contract (`server/providers/exposure/interface.ts`)

`getName()`, `getCapabilities()` (identifier types, rate limit, optional attribution, `isDemo`), and `search(identifier, { signal })`. The result is `ok` with `ProviderExposure[]`, or `error` with a category (`rate_limited | unavailable | unauthorized | timeout | invalid_response`), `retryable`, and an optional `retryAfterMs`.

Providers never set severity or discovery time (D-006). Provider-specific types stay in the provider's folder. Adding a provider means adding a folder, plus one line in `registry.ts`, plus passing `tests/unit/provider-contract.test.ts`.

## Have I Been Pwned (`hibp/`)

Terms checked on **2026-10-06** from haveibeenpwned.com/API/v3 and /Subscription. Re-check before going live.

| Topic          | What HIBP requires / offers                                                                                                                              | What we do                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Key            | `hibp-api-key` header (32 hex chars) for any search by email                                                                                             | `HIBP_API_KEY`, validated at startup; required when `PROVIDER_MODE=live`                         |
| User-Agent     | mandatory and must describe the consumer accurately (403 otherwise)                                                                                      | `consltek-breach-monitoring/0.1 (+APP_URL)` (from `config/brand.ts`)                             |
| Endpoint       | `GET /api/v3/breachedAccount/{email}?truncateResponse=false`; 404 = not pwned                                                                            | the only URL we call (constant base; percent-encoded, normalized address); redirects refused     |
| Rate limits    | per subscription. Core 1: 10 RPM ($4.39/mo); Core 2: 50; Core 3: 100; Core 4: 500; Core 5: 1,000; Pro/High RPM higher. 429 + `retry-after` (seconds)     | shared Redis budget per provider (`HIBP_REQUESTS_PER_MINUTE`, default 10); Retry-After honoured  |
| Licence        | breach data is **CC BY 4.0**: "clear and visible attribution with a link to haveibeenpwned.com should be present anywhere data from the service is used" | capability `attribution`; the UI must render it wherever HIBP-sourced exposures appear (Phase 7) |
| Acceptable use | no querying "to cause harm to the victims of data breaches", no circumventing controls, no misrepresenting the source                                    | ownership verification before any lookup (spec 2.3); attribution; no scraping of other endpoints |
| Stealer logs   | Pro plan or higher, and only for domains on the domain-search dashboard                                                                                  | not used                                                                                         |

**Mapping:**

- `Title` becomes the source name and `Name` the provider reference.
- `BreachDate` is day precision (UTC); `AddedDate` maps to `addedToProviderAt`.
- `DataClasses` map through `hibp/data-classes.ts`. "Passwords" maps to `password_hash` (D-027).
- `IsStealerLog` or `IsMalware` → `stealer_log`; `IsSpamList` → `other` with confidence 0.5. Otherwise confidence is 0.95 if verified and 0.6 if not.
- `IsSensitive` → sensitive source.
- Fabricated and retired breaches are dropped. The HTML `Description` is never stored.
- Evidence link: `https://haveibeenpwned.com/Breach/{Name}`.

**Errors:**

| Response                    | Category           | Retryable                |
| --------------------------- | ------------------ | ------------------------ |
| 401 / 403                   | `unauthorized`     | no                       |
| 400                         | `invalid_response` | no                       |
| 429                         | `rate_limited`     | yes, with `retryAfterMs` |
| 5xx                         | `unavailable`      | yes                      |
| Network failure             | `unavailable`      | yes                      |
| Timeout                     | `timeout`          | yes                      |
| Bad JSON or schema mismatch | `invalid_response` | —                        |

**Fixtures** (`tests/fixtures/hibp/`) were recorded on 2026-10-06 from HIBP's public, keyless breach endpoints: Adobe, LinkedIn, AshleyMadison (sensitive), Canva, June2026StealerLogs, Acuity (spam list), Zoosk (fabricated), and the data-class list. Account responses are assembled from these breach models. No real person's email was looked up.

### Test API key (checked 2026-10-27, D-042)

HIBP documents a test key, `00000000000000000000000000000000` ("any value that conforms to the required key format"), that gives "limited access (typically to test email addresses)". Verified live on 2026-10-27:

| Request with the test key                            | Result                                                                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `breachedAccount/<alias>@hibp-integration-tests.com` | real HIBP responses for the 16 documented aliases (10 × 200 with breaches, 6 × 404)                                           |
| `breachedAccount/<any real address>`                 | **401** "Access denied due to invalid subscription key" → `unauthorized`, shown as a provider failure, never as "no findings" |
| no `user-agent`                                      | 403 "API request must include a user agent"                                                                                   |
| malformed key (e.g. `abc`)                           | 401 "improperly formed hibp-api-key"                                                                                          |

So the test key proves the request shape, headers, parsing and error handling, but it **cannot** check a real user's address. In the app, a user can only scan an address they have verified by email, and `@hibp-integration-tests.com` can't receive mail, so the test key is exercised outside the app:

- `npm run hibp:smoke`: runs the real adapter against 3 test aliases (`--all` for all 16, paced under 10 requests a minute). Uses `HIBP_API_KEY` if set, otherwise the test key. Only test-domain addresses are ever queried.
- `npm run hibp:smoke -- --record`: re-records `tests/fixtures/hibp/test-key/*.json`, which `tests/unit/hibp-test-key.test.ts` replays offline.
- Startup validation refuses the all-zero test key when `NODE_ENV=production` and `PROVIDER_MODE=live`: every real scan would fail.

Not testable with the test key: pastes, stealer-log and domain-search endpoints (not used by the app), and real addresses. The `subscription-free-*` aliases returned fewer breaches than the docs describe (2 instead of 3, and a 404); the fixtures record what the API actually returned.

**Running live** needs a paid key from the project owner (D-012). Set `PROVIDER_MODE=live`, `HIBP_API_KEY` and `HIBP_REQUESTS_PER_MINUTE`. Switching from the test key to a paid key is only a change to `HIBP_API_KEY`.

## Demo / mock providers (`mock/`)

- **Scenarios for tests:** `clean`, `single`, `multiple`, `duplicate`, `failing`, `partial-failure`, `slow-timeout`.
- **Demo mode** (`PROVIDER_MODE=mock`): two deterministic "sources", `demo-breach-index` and `demo-credential-watch`, return fictional breaches (every name is suffixed "(fictional)").
  - The result depends on the address: a local part containing `clean` returns nothing, `fail` fails both sources, `partial` fails the second, `slow` times out the first. Anything else gets a hash-chosen subset.
  - Results are stored with `isDemo: true`, and the UI must label them "Demo data" (spec 4.3).

## Resilience (`server/services/exposure/`)

| Mechanism           | Setting                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-attempt timeout | 10 s                                                                                                                                                     |
| Retries             | up to 3 attempts; exponential backoff (300 ms base, 3 s cap) with full jitter; only retryable errors; Retry-After honoured up to 5 s, otherwise no retry |
| Circuit breaker     | 3 consecutive health failures open it for 5 min (`providerStates`, shared by all processes); the first call afterwards is the trial                      |
| Shared rate budget  | Redis, per provider, fail closed                                                                                                                         |
| Partial results     | one failing provider never hides another's findings                                                                                                      |
