# Threat Model (initial — Phase 1)

> Living document. The **Status** column says whether each mitigation is _built_ or _planned (phase N)_; as of Phase 13 every listed mitigation is built. Full review: Phase 11 (SECURITY.md).

## Assets

1. Monitored identifiers (emails now, phones/usernames later): the most sensitive asset. If leaked, they reveal who is using a breach monitor.
2. Exposure records: which breaches a person appears in, including sensitive (adult/health/dating) sources.
3. Account credentials, sessions, verification/reset tokens.
4. Encryption keyring, blind-index pepper, auth secret, provider API keys.
5. Audit logs (integrity).
6. Provider API quota (availability, cost).

## Trust boundaries

Browser ⇄ web app · web app ⇄ MongoDB · web app/worker ⇄ Redis · worker ⇄ providers (internet) · app ⇄ SMTP · operators ⇄ secrets store.

## STRIDE by component

| Component | Threat (STRIDE)                                    | Mitigation                                                                                                                                                       | Status                     |
| --------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Web app   | **S** session theft / fixation                     | `__Host-` HttpOnly SameSite=Lax cookie (Secure over HTTPS), new token per sign-in, server-side invalidation, sessions revoked on reset (D-018)                   | built (3)                  |
| Web app   | **T** XSS injecting script                         | React escaping, no `dangerouslySetInnerHTML`; per-request nonce CSP, no `'unsafe-inline'` in prod (D-007, D-014); E2E checks it                                  | built (2)                  |
| Web app   | **T** clickjacking / framing                       | CSP `frame-ancestors 'none'` + `X-Frame-Options: DENY`; verified by E2E against `next start`                                                                     | built (2)                  |
| Web app   | **R** user denies changing settings                | append-only audit log with request ID and hashed subject/IP (D-022)                                                                                              | built (3)                  |
| Web app   | **I** identifiers in URLs/analytics/referrers      | identifiers never in our URLs (E2E-checked), logs, audit metadata or Redis keys; masked display; audited reveal (D-023)                                          | built (4)                  |
| Web app   | **E** client-supplied IDs (IDOR)                   | repositories/services scope by `userId`; others' resources = not found (D-025); IDOR matrices for identities, scans, exposures, remediation; E2E cross-user URLs | built (4–8)                |
| API       | **S/T** CSRF on cookie-auth route handlers         | no auth HTTP surface (D-018); Server Actions origin check; `isSameOriginRequest` ready for route handlers                                                        | built (3)                  |
| API       | **T** NoSQL operator injection                     | Zod type validation + `sanitizeFilter` + `strictQuery`                                                                                                           | partly built (D-010)       |
| API       | **D** brute force / enumeration / scan flooding    | Redis rate limits, fail closed (D-020); enumeration-safe auth responses (D-019); scan lock + cooldown                                                            | auth built (3); scans (6)  |
| API       | **I** verbose errors                               | results mapped to fixed safe messages; error boundary shows only the digest                                                                                      | built (3)                  |
| Worker    | **D** provider outage cascades                     | timeouts, bounded retry with jitter, circuit breaker, ProviderState                                                                                              | built (5, 9)               |
| Worker    | **T** duplicate processing                         | compare-and-set state transitions, unique partial index for active scan, idempotent upserts                                                                      | built (6, 9)               |
| MongoDB   | **I** DB dump / Compass access reveals identifiers | AES-256-GCM field encryption (AAD-bound) + keyed HMAC blind index; test asserts no plaintext at rest; key rotation                                               | built (4)                  |
| MongoDB   | **E** open/unauthenticated instance                | bind 127.0.0.1 locally; least-privilege auth user in deployed envs                                                                                               | documented (4.5)           |
| Redis     | **I/T** queue payload tampering / leakage          | job payloads hold the scan ID only; processor re-reads and re-authorizes from MongoDB; Redis bound to localhost / auth in prod                                   | built (9)                  |
| Email     | **I** sensitive breach named in subject/preview    | sensitive sources omitted from all emails and subjects                                                                                                           | built (10)                 |
| Email     | **S** verification-link phishing                   | single-use, short-TTL, hashed-at-rest tokens; links only to `APP_URL`                                                                                            | built (3, 4)               |
| Providers | **I** identifier sent to third party               | disclosed on `/privacy` (Phase 13); one constant HTTPS base URL, redirects refused; TLS                                                                          | built (5)                  |
| Providers | **S** SSRF via user-controlled URL                 | no user-controlled outbound URLs; host allow-list                                                                                                                | built (5)                  |
| Logs      | **I** secrets/identifiers in logs                  | central pino redaction; planted-secret tests                                                                                                                     | **built** (logger + tests) |
| Config    | **I** placeholder or leaked secrets                | Zod rejects placeholders; value-free errors; `.env*` ignored; gitleaks in CI                                                                                     | **built** (env + CI)       |

## Abuse cases

| Abuse case                                           | Mitigation                                                                                                                                                         | Status       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| **Use Exovault to look up someone else's email**     | no anonymous lookup; scans only after ownership verification (OTP/link to that address); identity creation rate limit 5/day; 1 active identity per user by default | built (4)    |
| Mass account creation to bypass per-user limits      | sign-up 5/h/IP, account email verification required before any identity                                                                                            | built (3)    |
| Burning provider quota                               | per-identity 15-min manual cooldown, one active scan per identity, shared provider rate budget                                                                     | built (6, 9) |
| Inferring that an email has an account (enumeration) | identical responses/timing for sign-in/up/reset                                                                                                                    | built (3)    |
| Using notifications to harass a third party          | notifications only go to verified addresses; resend limits                                                                                                         | built (10)   |
| Stealing someone's data via a cross-site export      | export is `POST` with an explicit Origin check plus session; 5/h; audited                                                                                          | built (13)   |
| Deleting someone's account from a stolen session     | password re-entry (5 / 15 min); grace period with email to the owner; signing in restores                                                                          | built (13)   |
| A deleted user's data lingering                      | resumable purge across every collection; audit rows unlinked; whole-DB test for the address                                                                        | built (13)   |

## Residual risks (accepted, documented)

- Identifiers must be sent to providers to be checked. We trust each provider's handling.
- Coverage is limited to configured providers. Absence of results is not safety.
- Local dev MongoDB runs without auth (bound to localhost). Deployed environments must use authentication.
- The dev-only lint toolchain has known advisories (D-008).

## Phase 11 update (2026-10-07)

A full review against spec Part 12 is recorded in [SECURITY.md](SECURITY.md#phase-11-security-review-2026-10-07). New threats identified and mitigated:

| Component | Threat (STRIDE)                                                        | Mitigation                                                                              | Status     |
| --------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------- |
| Auth      | **S/E** pre-account hijacking (attacker pre-registers victim's email)  | verification bound to the password-setting sign-up; claim via set-password link (D-034) | built (11) |
| Auth      | **S** passwordless sign-in to verified accounts with an emailed code   | codes refused for verified accounts; resend only for bound, unverified accounts         | built (11) |
| Email     | **D** inbox flooding of a third party (codes, "account exists")        | per-target-address and per-email limits (D-035)                                         | built (11) |
| Tokens    | **T** forging unsubscribe tokens with truncated GCM tags               | 16-byte tags enforced                                                                   | built (11) |
| API       | **D** SSE connection exhaustion; **E** revoked session keeps streaming | per-user stream limit; periodic session re-check                                        | built (11) |
| Privacy   | **I** sensitive breach names via evidence links / view models          | withheld until the audited reveal                                                       | built (11) |

**Residual risks (accepted):** targeted 15-minute sign-in lockout; per-IP limits spoofable without a trusted proxy; session tokens in plaintext in the database (library behaviour); soft 404 for cross-user URLs; at-least-once alert delivery.
