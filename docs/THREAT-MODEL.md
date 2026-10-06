# Threat Model (initial — Phase 1)

> Living document. The **Status** column says whether each mitigation is _built_ or _planned (phase N)_. Full review: Phase 11.

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

| Component | Threat (STRIDE)                                    | Mitigation                                                                                                                                     | Status                     |
| --------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Web app   | **S** session theft / fixation                     | `__Host-` HttpOnly SameSite=Lax cookie (Secure over HTTPS), new token per sign-in, server-side invalidation, sessions revoked on reset (D-018) | built (3)                  |
| Web app   | **T** XSS injecting script                         | React escaping, no `dangerouslySetInnerHTML`; per-request nonce CSP, no `'unsafe-inline'` in prod (D-007, D-014); E2E checks it                | built (2)                  |
| Web app   | **T** clickjacking / framing                       | CSP `frame-ancestors 'none'` + `X-Frame-Options: DENY`; verified by E2E against `next start`                                                   | built (2)                  |
| Web app   | **R** user denies changing settings                | append-only audit log with request ID and hashed subject/IP (D-022)                                                                            | built (3)                  |
| Web app   | **I** identifiers in URLs/analytics/referrers      | identifiers never in our URLs; `Referrer-Policy: strict-origin-when-cross-origin`; masked display                                              | planned (4)                |
| Web app   | **E** client-supplied IDs (IDOR)                   | repositories take `userId`; not-found for others' resources; IDOR test matrix                                                                  | planned (4+)               |
| API       | **S/T** CSRF on cookie-auth route handlers         | no auth HTTP surface (D-018); Server Actions origin check; `isSameOriginRequest` ready for route handlers                                      | built (3)                  |
| API       | **T** NoSQL operator injection                     | Zod type validation + `sanitizeFilter` + `strictQuery`                                                                                         | partly built (D-010)       |
| API       | **D** brute force / enumeration / scan flooding    | Redis rate limits, fail closed (D-020); enumeration-safe auth responses (D-019); scan lock + cooldown                                          | auth built (3); scans (6)  |
| API       | **I** verbose errors                               | results mapped to fixed safe messages; error boundary shows only the digest                                                                    | built (3)                  |
| Worker    | **D** provider outage cascades                     | timeouts, bounded retry with jitter, circuit breaker, ProviderState                                                                            | planned (5/9)              |
| Worker    | **T** duplicate processing                         | compare-and-set state transitions, unique partial index for active scan, idempotent upserts                                                    | planned (6)                |
| MongoDB   | **I** DB dump / Compass access reveals identifiers | AES-256-GCM field encryption + HMAC blind index; test asserts no plaintext at rest                                                             | planned (4)                |
| MongoDB   | **E** open/unauthenticated instance                | bind 127.0.0.1 locally; least-privilege auth user in deployed envs                                                                             | documented (4.5)           |
| Redis     | **I/T** queue payload tampering / leakage          | job payloads hold IDs only, never identifiers; Redis bound to localhost / auth in prod                                                         | planned (9)                |
| Email     | **I** sensitive breach named in subject/preview    | sensitive sources omitted from all emails and subjects                                                                                         | planned (10)               |
| Email     | **S** verification-link phishing                   | single-use, short-TTL, hashed-at-rest tokens; links only to `APP_URL`                                                                          | planned (3/4)              |
| Providers | **I** identifier sent to third party               | disclosed in `/privacy`; only allow-listed hosts; TLS                                                                                          | planned (5)                |
| Providers | **S** SSRF via user-controlled URL                 | no user-controlled outbound URLs; host allow-list                                                                                              | planned (5)                |
| Logs      | **I** secrets/identifiers in logs                  | central pino redaction; planted-secret tests                                                                                                   | **built** (logger + tests) |
| Config    | **I** placeholder or leaked secrets                | Zod rejects placeholders; value-free errors; `.env*` ignored; gitleaks in CI                                                                   | **built** (env + CI)       |

## Abuse cases

| Abuse case                                           | Mitigation                                                                                                                                                         | Status        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| **Use Exovault to look up someone else's email**     | no anonymous lookup; scans only after ownership verification (OTP/link to that address); identity creation rate limit 5/day; 1 active identity per user by default | planned (4)   |
| Mass account creation to bypass per-user limits      | sign-up 5/h/IP, account email verification required before any identity                                                                                            | planned (3)   |
| Burning provider quota                               | per-identity 15-min manual cooldown, one active scan per identity, shared provider rate budget                                                                     | planned (6/9) |
| Inferring that an email has an account (enumeration) | identical responses/timing for sign-in/up/reset                                                                                                                    | planned (3)   |
| Using notifications to harass a third party          | notifications only go to verified addresses; resend limits                                                                                                         | planned (10)  |

## Residual risks (accepted, documented)

- Identifiers must be sent to providers to be checked. We trust each provider's handling.
- Coverage is limited to configured providers. Absence of results is not safety.
- Local dev MongoDB runs without auth (bound to localhost). Deployed environments must use authentication.
- The dev-only lint toolchain has known advisories (D-008).
