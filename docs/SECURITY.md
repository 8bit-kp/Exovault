# Security

> Status: describes controls that exist in code as of **Phase 4**. Planned controls are listed in [THREAT-MODEL.md](THREAT-MODEL.md) with their phase. Not a substitute for an independent review.

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

## Rate limits (spec 12.3, D-020)

Redis fixed windows, keyed by HMAC of the subject, all **fail closed**:

| Rule                   | Limit                                                                 |
| ---------------------- | --------------------------------------------------------------------- |
| Sign-in                | 5 / 15 min per IP + per account (verification-code attempts share it) |
| Sign-up                | 5 / hour per IP                                                       |
| Verification resend    | 3 / hour per account                                                  |
| Password reset request | 3 / hour per account + per IP                                         |
| Identity creation      | 5 / day per user (Phase 4)                                            |

Per-IP limits depend on `TRUSTED_PROXY_COUNT` (D-021).

## Web hardening (Phase 2, D-007, D-014)

Per-request nonce CSP with no `'unsafe-inline'` in production, `frame-ancestors 'none'`, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP, HSTS in production. All verified against `next start` in E2E.

## Logging and audit

- pino with central key redaction (`lib/logging/logger.ts`). Third-party log text passes through `scrubMessage` (emails and tokens removed).
- Append-only `auditLogs` with hashed subject and IP (D-022). Events emitted today: `USER_CREATED`, `EMAIL_VERIFIED`, `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET_COMPLETED`, `SESSIONS_REVOKED`, `RATE_LIMITED`, `IDENTITY_ADDED`, `IDENTITY_VERIFICATION_SENT`, `IDENTITY_VERIFIED`, `IDENTITY_REVEALED`, `IDENTITY_REMOVED` (identity IDs only, never values).

## Known gaps

- No MFA yet (TOTP/passkeys planned; D-022).
- Session tokens are stored in plaintext in the `session` collection (library behaviour). Anyone with database read access could hijack sessions. Mitigations: an authenticated, least-privilege DB user in deployed environments, and the 7-day expiry.
- Per-IP limits are spoofable without a trusted proxy (D-021).
- Cross-user resource URLs in the app return a soft 404 (status 200, `noindex`; D-025).
- The encryption keyring lives in environment variables; a KMS-backed envelope (data keys wrapped by a KMS key) is the production upgrade path.
