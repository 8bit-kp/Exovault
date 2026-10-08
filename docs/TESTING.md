# Testing

> Status: **M3 complete (Phase 13).** Every suite below runs locally and in CI. Automated tests use deterministic fixtures and mock providers only: no live breach APIs and no real third-party addresses.

## Suites

| Command                    | Runner                       | Environment                                                                                                      | Scope                                                                                                               |
| -------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `npm run test:unit`        | Vitest `node` + `components` | node; jsdom + axe-core for components                                                                            | pure logic and components                                                                                           |
| `npm run test:integration` | Vitest `integration`         | **in-memory standalone MongoDB** (`mongodb-memory-server`, same topology as local dev) + local Redis DB 15       | services end to end against a real database: auth, identities, engine, scans, risk, remediation; `tests/security/*` |
| `npm run test:e2e`         | Playwright                   | **production build** (`next start`), Mailpit for email, DB `exovault_e2e`, Redis DB 14, desktop Chrome + Pixel 7 | user journeys, headers/CSP, axe incl. colour contrast, keyboard, mobile                                             |

Isolation: tests set their own env (`tests/setup/test-env.ts`) and never read `.env.local`. Integration tests use `MONGODB_URI_TEST` (the in-memory server); E2E uses its own database and Redis DB.

## What is covered (spec 14.3)

**Unit**

- Identifier normalization (each spec 7.4 rule) and field encryption (round trip, AAD binding, tamper detection, key rotation).
- Severity matrix (with monotonicity), source keys, fingerprint, dedupe and merge.
- Resilience: retry, backoff, Retry-After, timeouts.
- Provider contract: every mock, demo and HIBP-fixture provider.
- `calculateRiskScore`: worked examples, bounds, 500-case monotonicity, order independence, diminishing returns, remediation, recency, detection and MFA.
- `getRecommendedActions` and the remediation transitions and checklist.
- Scan state machine, rate limiter (including fail-closed), CSP builder, open-redirect guard, Origin check, client IP, sealed cookies, log scrubbing, env validation.

**Integration**

- Auth flows: hashed single-use codes and tokens, enumeration safety, sessions.
- Identities:
  - Ciphertext at rest, which is what Compass shows.
  - Ownership codes, plus the limit tested under 4 concurrent adds.
  - Double submit, AAD swap, rotation.
- Engine:
  - Clean, multiple, duplicate and cross-provider results.
  - Partial and total failure, timeout.
  - Idempotency, concurrent runs.
  - Changed and no-longer-reported, remediation preserved.
  - Circuit breaker, rate budget.
- Scans:
  - Lifecycle and step history.
  - Lock (5 concurrent starts), cooldown, double processing.
  - Stale recovery, retry of failed sources.
- Risk snapshots.
- Remediation: checklist-driven state, transitions, reasons, reveal audit, cascade.
- Audit log: hashed, append-only.

**Worker** (`worker.test.ts`)

- BullMQ end to end with an isolated prefix.
- The payload holds IDs only.
- The job scheduler is registered.
- Graceful close finishes in-flight scans.
- Due → exactly one scheduled scan; next time moves on.
- Concurrent ticks never double-schedule; one scan after days of downtime.
- Disabled, unverified and removed identities are never scheduled.
- Disabling cancels queued scans; degraded state; monitoring IDOR.

**Notifications** (`notifications.test.ts`)

- New exposures alert once, to the account email, with the masked identity, app links, and sensitive sources hidden.
- No repeats across later scans; escalation alerts once; non-escalating changes stay silent; manual scans don't alert.
- Email off (even after creation); quiet hours hold then deliver; digest = one email.
- Strict preference validation.
- Concurrent dispatchers send each alert exactly once; retries then fail after 3.
- Real rendering: no identifier or source in the subject, RFC 8058 headers.
- Unsubscribe tokens (valid, forged, missing); inbox scoping; 90-day TTL.

**Privacy** (`account-privacy.test.ts`, Phase 13)

- Export: the owner's data in clear (identifier decrypted), no internal fields, nothing of another user's; audited; 6th export in an hour refused.
- Deletion request: wrong password refused and audited; password guesses limited; freeze (sessions, monitoring, alerts) at once; the address held only encrypted; the date doesn't move on a repeat request.
- Cancel during the grace period, once; a later purge leaves the account alone.
- Purge: nothing before the date; afterwards every user collection and Better Auth row is gone, the other account is untouched, audit rows are unlinked, and **a scan of the whole database finds neither the address nor the user id**; one completion email; resumes after an email failure only once the claim is stale; a claimed purge can't be cancelled.
- `db-indexes-coverage.test.ts` (unit): every model is in `npm run db:indexes`.

**Phase 11 security tests**

- `account-takeover.test.ts`: the full pre-account hijacking attack and the claim; nonce binding; codes refused for verified accounts; reset = mailbox proof.
- `abuse-limits.test.ts`: per-target code budget across accounts; reveal and unsubscribe caps; sensitive names absent from detail and list models.
- `log-leakage.test.ts`: real flows at trace level, including export, account deletion and a purge whose emails fail with the address in the error, scanning serialized log output for planted passwords, codes, tokens, identifiers and server keys.
- `hardening.test.ts`: request IDs, evidence URLs, strict ObjectIds, short GCM tags rejected, production refusing test secrets.
- E2E `csrf.spec.ts`: a Server Action replayed with a foreign Origin is refused; framing denied; security.txt; deny-all CSP on `/api`.

**Security** (`tests/security`, `*-idor`, and IDOR blocks inside integration files)

- **IDOR matrix:** another user's identities, scans, exposures, remediation, and sensitive-source reveal all return "not found".
- **Malformed and operator-shaped IDs and input;** no Better Auth HTTP surface.
- **Rate limits and fail-closed:** 5 sign-ins per IP or account, 5 sign-ups per IP, resend and reset limits.
- **No identifiers at rest:** none in exposures, scans, breaches, provider states, audit logs or Redis keys.

**E2E**

- **Account:** sign-up → emailed code (Mailpit) → onboarding → identity → first scan with live SSE progress → results (labelled "Demo data") → dashboard (score, "Why this score?", actions, activity).
- **Exposure detail:** checklist → status → the score falls. Sensitive-source reveal; dismiss with a reason.
- **Scan results:** clean wording (never "safe"), partial + retry.
- **Sessions and auth:** sign-out invalidation with a replayed cookie, forged cookie, password reset revoking sessions, open redirect, 6th sign-in refused.
- **Cross-user URLs:** they reveal nothing (soft 404, D-025), and the SSE/JSON endpoints require the owner.
- **Headers:** CSP nonce and headers on every page, no console CSP violations.
- **Privacy** (`privacy.spec.ts`): download my data (a real file, the owner's address in it); the export endpoint refuses a foreign Origin (403) and no session (401); delete with a wrong then right password → signed out → sign-in notice and email → the app is closed except the restore page → "Keep my account" → back in.
- **Public pages:** `/how-it-works`, `/security`, `/privacy`, `/about` get the same CSP and axe checks as every public page.
- **Accessibility:** axe (WCAG 2.2 AA incl. contrast) on public and app pages, the skip link, and the mobile drawer.

## Notes

- **Load sensitivity:** E2E journeys hash passwords (scrypt), so files with heavy auth run their tests in order, with generous post-submit timeouts. Locally, 4 workers run; in CI, 2.
- **Per-test client IP:** each test sends its own `X-Forwarded-For`, simulating one trusted proxy (`TRUSTED_PROXY_COUNT=1`), so parallel tests don't share per-IP rate limits. A dedicated test proves the limit still triggers.
- **Not yet covered:** a live E2E of an alert email through Mailpit. That needs a scheduled scan to fire inside a test, so integration covers it with the real email renderer instead.
- **Not covered end to end:** the purge itself in E2E, since it runs after a 7-day grace period. Integration tests drive it with an injected clock instead.
- **Container images:** CI builds both Dockerfiles. They are not run in CI; DECISIONS D-038 records how each stage was checked locally.
