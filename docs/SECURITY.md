# Security

> Status: describes controls that exist in code as of **Phase 13 (M3 complete)**. Not a substitute for an independent review.

## Authentication (Better Auth 1.7.7, D-002, D-018, D-019)

| Control            | Implementation                                                                                                                                                   | Verified by                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Password storage   | scrypt (library default, Node's libuv implementation); plaintext never stored or logged                                                                          | `auth-flows.test.ts` "stores no plaintext password"     |
| Password policy    | 12–128 chars, no composition rules, Pwned Passwords k-anonymity check (NIST 800-63B)                                                                             | `auth-validation.test.ts`, `auth-input.test.ts`         |
| Email verification | 6-digit code, 10 min, 3 attempts, stored hashed, single use; required before any session                                                                         | `auth-flows.test.ts`, E2E journey via Mailpit           |
| Password reset     | 30 min single-use token stored as SHA-256; all sessions revoked; "password changed" email                                                                        | `auth-flows.test.ts`, E2E reset journey                 |
| Enumeration safety | identical responses for existing/unknown accounts on sign-up, sign-in and reset; emails sent in the background                                                   | integration + E2E                                       |
| Sessions           | random server-side tokens; `__Host-` HttpOnly SameSite=Lax cookie over HTTPS; 7-day lifetime; new session per sign-in; sign-out deletes the row; no cookie cache | E2E "stolen cookie stops working after sign-out"        |
| Session management | Settings → Security lists sessions (browser only, no IP) and revokes one or all others; queries scoped by `userId`                                               | `session-repository.ts`; E2E                            |
| Protected routes   | `proxy.ts` redirects when no cookie (convenience); every `/app` layout, page and action calls `requireSession()` (D-003)                                         | E2E "forged cookie rejected by the server"              |
| Open redirects     | `returnTo` allow-listed to `/app/*` and `/onboarding/*`, root-relative only, control characters rejected                                                         | `redirect-and-origin.test.ts`, E2E                      |
| CSRF               | Server Actions: Next.js Origin/Host check. No Better Auth HTTP surface. `lib/security/origin.ts` ready for future route handlers                                 | `redirect-and-origin.test.ts`; E2E 404 on `/api/auth/*` |

## Identifier protection (spec 5.1, D-023, D-024)

| Control                    | Implementation                                                                                                                                                   | Verified by                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Encryption at rest         | AES-256-GCM, random IV, AAD `identity:<_id>`, versioned keyring, `npm run keys:rotate`                                                                           | `field-encryption.test.ts`, `key-rotation.test.ts` |
| No plaintext in the DB     | ciphertext + keyed HMAC blind index + mask only                                                                                                                  | `identity.test.ts` "what Compass shows"            |
| Ownership before any check | account email auto-verified only if the account is verified; any other address needs a 6-digit emailed code (keyed HMAC at rest, 15 min, 5 attempts, single use) | `identity.test.ts`, E2E via Mailpit                |
| Abuse limits               | 5 identity adds / day / user; 10 code guesses / 15 min / user; 3 resends / hour / identity; active-identity cap enforced atomically                              | `identity.test.ts` (incl. concurrent adds)         |
| Authorization              | every query scoped by `userId`; others' identities are indistinguishable from missing ones (D-025)                                                               | `identity-idor.test.ts`, E2E                       |
| Reveal                     | explicit button, audited (`IDENTITY_REVEALED`), auto-hides after 30 s                                                                                            | `identity.test.ts`, E2E                            |

## Scanning (D-029)

| Control                  | Implementation                                                                                                              | Verified by                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Only verified identities | `withDecryptedIdentity` refuses pending identities; decryption happens inside the processor only                            | `scan.test.ts`, `exposure-engine.test.ts` |
| Abuse / quota protection | one active scan per identity (unique partial index), 15-min manual cooldown, 3 retries/h, provider budgets, circuit breaker | `scan.test.ts` (incl. concurrent starts)  |
| Progress endpoints       | session required; scans looked up by `(userId, scanId)`; 401 / 404; GET only; no identifier in payloads                     | `scan.spec.ts` (E2E)                      |
| No double processing     | compare-and-set `queued → running`                                                                                          | `scan.test.ts`                            |

## Exposures and remediation (D-031)

| Control                       | Implementation                                                                                        | Verified by                            |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Ownership on every read/write | exposures, checklist items and status changes queried by `(userId, exposureId)`; not found otherwise  | `remediation.test.ts` IDOR matrix; E2E |
| Sensitive sources (spec 2.3)  | hidden in lists, emails, page titles and the detail view model; reveal is explicit and audited        | `remediation.test.ts`, E2E             |
| Input                         | checklist key must belong to the exposure; status from a fixed enum; dismiss reason from a fixed list | `remediation.test.ts`                  |
| No raw breach data            | only categories are stored and shown; evidence links point at the provider's public page              | design + `exposure-engine.test.ts`     |

## Worker and monitoring (D-032)

| Control                         | Implementation                                                                     | Verified by                   |
| ------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------- |
| No identifiers in Redis         | job payload is `{ scanId }`; decryption happens inside the worker's processor only | `worker.test.ts`              |
| No double scheduling            | compare-and-set claim on `nextScanAt`; one active scan per identity (unique index) | `worker.test.ts`              |
| Only verified, owned identities | enable checks ownership + verification; the scheduler re-checks both               | `worker.test.ts`              |
| Monitoring IDOR                 | enable/disable/read scoped by `userId`                                             | `worker.test.ts`              |
| URL filters (timeline)          | strict enum/pattern validation; injection-shaped values dropped                    | `dashboard-data.test.ts`, E2E |

## Alerts (D-033)

| Control                        | Implementation                                                                                         | Verified by                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ | ---------------------------- |
| No identifiers in subjects     | fixed subjects; bodies show masked identity; sensitive sources never named                             | `notifications.test.ts`      |
| No duplicate alerts            | unique dedupe key; compare-and-set dispatch claims                                                     | `notifications.test.ts`      |
| Respect for the user's choices | preferences re-checked at send time; quiet hours; digest; one-click unsubscribe (RFC 8058)             | `notifications.test.ts`, E2E |
| Unsubscribe token              | sealed AES-GCM, purpose-bound, 90 days; only disables alert email; confirmation page never acts on GET | `notifications.test.ts`, E2E |
| Inbox                          | scoped by `userId`                                                                                     | `notifications.test.ts`      |
| No email content stored        | rendered at send time from IDs                                                                         | design                       |

## Rate limits (spec 12.3, D-020)

Redis fixed windows, keyed by HMAC of the subject (never the raw email or IP), all **fail closed**. Source of truth: `config/rate-limits.ts`.

| Rule                                      | Limit                                                        |
| ----------------------------------------- | ------------------------------------------------------------ |
| Sign-in (password or email code)          | 5 / 15 min per IP, and 5 / 15 min per account                |
| Sign-up                                   | 5 / hour per IP, 3 / hour per email address                  |
| Verification-code resend                  | 3 / hour per account                                         |
| Password-reset request                    | 3 / hour per account, 3 / hour per IP                        |
| Password-reset submit                     | 10 / hour per IP                                             |
| Identity creation                         | 5 / day per user                                             |
| Ownership codes issued                    | 5 / day per target address                                   |
| Ownership code guesses                    | 10 / 15 min per user, 10 / 15 min per target address         |
| Ownership code resend                     | 3 / hour per identity                                        |
| Retry failed source                       | 3 / hour per identity (manual scans: 15-min cooldown, D-029) |
| Reveals (identity, sensitive source)      | 30 / hour per user                                           |
| Unsubscribe                               | 20 / hour per IP                                             |
| Scan progress streams opened              | 30 / 5 min per user                                          |
| Password re-entry before account deletion | 5 / 15 min per user                                          |
| Data export                               | 5 / hour per user                                            |

Per-IP limits depend on `TRUSTED_PROXY_COUNT` (D-021).

## Data export and account deletion (Phase 13, spec 5.2, D-037)

| Control                              | Implementation                                                                                                                | Verified by                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Export can't be triggered cross-site | `POST` only; explicit `isSameOriginRequest` before the session check; session required                                        | `privacy.spec.ts` (403 foreign Origin, 401)                           |
| Export contains no internals         | explicit field list; no ciphertext, blind index, fingerprints, code hashes, dedupe keys, audit hashes; only the caller's rows | `account-privacy.test.ts`                                             |
| Deletion needs re-authentication     | password checked against the stored hash (no session created), plus a confirmation; 5 tries / 15 min                          | `account-privacy.test.ts`, `privacy.spec.ts`                          |
| Frozen during the grace period       | sessions deleted, monitoring off, queued scans cancelled, alerts suppressed; `requireSession()` admits only the restore page  | `account-privacy.test.ts`, `privacy.spec.ts`                          |
| Complete, resumable purge            | idempotent deletes in every collection and Better Auth's; claim by compare-and-set; stale claims resumed                      | `account-privacy.test.ts` (whole-DB scan for the address and user id) |
| Audit trail kept but unlinked        | `userId` and `subjectHash` nulled on the user's rows; `ACCOUNT_DELETED` has no user reference                                 | `account-privacy.test.ts`                                             |
| No address in logs                   | export, deletion and a failing purge included in the planted-secret log scan                                                  | `log-leakage.test.ts`                                                 |

## Web hardening (Phase 2, D-007, D-014)

Per-request nonce CSP with no `'unsafe-inline'` in production, `frame-ancestors 'none'`, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP, HSTS in production. All verified against `next start` in E2E.

## Logging and audit

- pino with central key redaction (`lib/logging/logger.ts`). Third-party log text passes through `scrubMessage` (emails and tokens removed).
- Append-only `auditLogs` with hashed subject and IP (D-022), kept 12 months. Every event in `lib/domain/audit.ts` is emitted: account (`USER_CREATED`, `EMAIL_VERIFIED`, `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`, `SESSIONS_REVOKED`, `RATE_LIMITED`, `ACCOUNT_SETTINGS_CHANGED`), identities (`IDENTITY_ADDED`, `IDENTITY_VERIFICATION_SENT`, `IDENTITY_VERIFIED`, `IDENTITY_REVEALED`, `IDENTITY_REMOVED`), scanning and exposures (`SCAN_STARTED`, `SCAN_COMPLETED`, `SCAN_FAILED`, `EXPOSURE_DETECTED`, `REMEDIATION_UPDATED`, `SENSITIVE_SOURCE_REVEALED`), monitoring and alerts (`MONITORING_ENABLED`, `MONITORING_DISABLED`, `NOTIFICATION_SENT`), privacy (`DATA_EXPORTED`, `ACCOUNT_DELETION_REQUESTED`, `ACCOUNT_DELETION_CANCELLED`, `ACCOUNT_DELETED`). Metadata holds IDs and categories only, never values. The account-deletion anonymiser is the one writer allowed to change rows (D-037).

## Known gaps

- No MFA yet (TOTP/passkeys planned; D-022).
- Session tokens are stored in plaintext in the `session` collection (library behaviour). Anyone with database read access could hijack sessions. Mitigations: an authenticated, least-privilege DB user in deployed environments, and the 7-day expiry.
- Per-IP limits are spoofable without a trusted proxy (D-021).
- Cross-user resource URLs in the app return a soft 404 (status 200, `noindex`; D-025).
- The encryption keyring lives in environment variables; a KMS-backed envelope (data keys wrapped by a KMS key) is the production upgrade path.

## Phase 11 security review (2026-10-07)

The review was done in three parallel, read-only passes (authorization/IDOR, injection/output handling, secrets/logging/cookies/limits), each citing file and line. Headers were checked against a running production build. Every finding was confirmed against the code before it was fixed.

| ID  | Finding                                                                                                                           | Severity   | Status                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------- |
| R1  | Pre-account hijacking: an emailed code verified an attacker-created account                                                       | **Medium** | Fixed (D-034), `account-takeover.test.ts`             |
| R2  | Emailed code signed into an already-verified account without the password                                                         | Medium     | Fixed (D-034)                                         |
| R3  | Sealed tokens accepted truncated GCM tags (unsubscribe-token forgery)                                                             | Low        | Fixed (D-035), unit test                              |
| R4  | Pending-verification cookie not cleared over HTTPS (`__Host-` without `Secure`); not cleared on sign-out                          | Low/Medium | Fixed (D-035), E2E check                              |
| R5  | Sensitive breach name exposed via evidence link; sensitive names in list view models                                              | Low        | Fixed (D-035), `abuse-limits.test.ts`                 |
| R6  | SSE stream: no session re-check, no cap                                                                                           | Low/Medium | Fixed (D-035)                                         |
| R7  | No limits per target address on ownership codes; sign-up only per IP                                                              | Low/Medium | Fixed (D-035), `abuse-limits.test.ts`                 |
| R8  | Breached password burned the reset link; reset submit unlimited                                                                   | Low        | Fixed (D-035)                                         |
| R9  | Unlimited reveals and unsubscribe                                                                                                 | Low        | Fixed (D-035), `abuse-limits.test.ts`                 |
| R10 | Client `x-request-id` reaches audit when the proxy is skipped                                                                     | Low        | Fixed (D-035), unit test                              |
| R11 | Evidence URLs not scheme-checked at runtime                                                                                       | Low        | Fixed (D-035), unit test                              |
| R12 | Test/CI secrets would be accepted in production                                                                                   | Low        | Fixed (D-035), unit test                              |
| R13 | Minor: loose ObjectId checks, unscoped cooldown helper, worker logged error message, scrubber unbounded, header keys not redacted | Info       | Fixed (D-035)                                         |
| R14 | Per-account sign-in limit enables targeted 15-min lockout                                                                         | Low        | **Accepted** (trade-off; CAPTCHA is the upgrade path) |
| R15 | Per-IP limits spoofable without a trusted proxy                                                                                   | Low        | **Accepted**, deployment requirement (D-021)          |

**Verified correct (no change needed):**

- **Authorization:** every Server Action, route handler and data page authenticates itself and scopes by the session user. There's no horizontal IDOR, no mass assignment, and no admin surface.
- **Database queries:** no operator injection (`sanitizeFilter`, strict IDs; every `mongoose.trusted()` value is server-derived).
- **XSS:** no `dangerouslySetInnerHTML`, and email HTML is fully escaped.
- **SSRF and redirects:** no SSRF (one fixed outbound host, `redirect: "error"`), and no open redirect.
- **Code safety:** no ReDoS-prone pattern on unbounded input, and no eval or deserialization of untrusted data.
- **Secrets:** no secrets in the repository or its history (one deliberately fake test URI is allow-listed), and none reach the client.
- **Logs:** log calls carry IDs and error names only. A planted-secret test scans real serialized log output across auth, identity, scan, alert and failure paths.
- **Cookies:** the session cookie is `__Host-` over HTTPS, `HttpOnly`, `SameSite=Lax`, and gets a new token on sign-in.
- **CSRF:** a Server Action replayed with a foreign `Origin` is refused by Next.js (E2E `csrf.spec.ts`).
- **Headers:** CSP with a nonce, HSTS (production), `X-Frame-Options: DENY`, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP, no `X-Powered-By`, deny-all CSP on `/api/*`, and `/.well-known/security.txt`.

**Dependencies:** `npm audit --omit=dev` reports 0 vulnerabilities. The 5 high findings in the dev-only lint chain are tracked in D-008.
