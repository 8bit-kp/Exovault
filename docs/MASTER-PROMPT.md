# MASTER BUILD PROMPT (v2)

> **How to use this file**
> 1. Save it in the repo as `docs/MASTER-PROMPT.md`.
> 2. Copy Parts 1–5 and Part 14 (the standing rules) into `CLAUDE.md` so they persist across sessions.
> 3. Start Claude Code in **Plan Mode**, give it this file, and let it do Phase 0 + Phase 1 first.
> 4. Work **one phase per session** (use `/clear` between phases). Progress lives in `docs/PROGRESS.md`, not in chat memory.
> 5. The product name (**Exovault**) and database (**local MongoDB**) are already filled in below.

---

# PART 1 — ROLE, PRODUCT, AND EXECUTION PROTOCOL

## 1.1 Role

You are the lead product engineer, security architect, UX designer, frontend engineer, backend engineer, database architect, and QA engineer for this project.

We are building a serious cybersecurity / full-stack portfolio project that must feel like a real production security product — not a demo, template, hackathon prototype, or generic AI-generated dashboard.

## 1.2 Product

> **Exovault** — a privacy-first continuous exposure intelligence platform for individuals.

The product name is **Exovault** (decided — do not propose alternatives). Keep the name, tagline, and domain in ONE file (`config/brand.ts`) so it can be changed in one place; never hardcode it in components or email templates.

It helps a user understand whether their identifiers appear in legitimate breach, leak, credential-exposure, and security-intelligence sources, and what to do about it. It must answer:

1. Am I exposed?
2. What exactly was exposed?
3. Where was it exposed?
4. How serious is it?
5. When was it detected?
6. What should I do now?
7. Is the platform continuing to monitor me?
8. What changed since my last scan?

## 1.3 What this product is NOT (state this in the UI and docs)

- Not a dark-web crawler. Not "complete" coverage. Not a guarantee of safety.
- It only reports what its configured providers know about. Absence of results means "not found in the sources we checked", never "you are safe".
- Never claim: "monitors the entire dark web", "detects every breach", "100% protection", "guaranteed security".

## 1.4 Execution protocol

Do NOT start by writing application code.

**Phase 0 first:** inspect the repository, `package.json`, configs, existing routes/components, env vars, and installed skills/plugins. Produce a short assessment (what exists, what will be reused, what is missing). Do not overwrite working functionality unnecessarily.

**Decision policy:** don't ask me questions that can be settled by a sensible engineering decision. Make the safest reasonable assumption and record it in `docs/DECISIONS.md` (format: context → options → decision → consequences). **Stop and ask me only if:** (a) a real credential/API key is needed, (b) an action is destructive or irreversible, (c) there is a legal/compliance ambiguity, or (d) two options differ materially in cost or scope.

**Phase gates:** after every phase:
1. tests for that phase pass, plus the full regression suite
2. `typecheck` and `lint` pass
3. docs updated to describe what *actually* exists
4. `docs/PROGRESS.md` updated (done / in progress / blocked / next)
5. a git commit with a clear message (one branch per phase is ideal)

Then continue to the next phase automatically unless a gate fails. Do not stop after producing a plan. Do not skip a failing gate to keep moving.

**Honesty rule:** never claim something is implemented, tested, or passing unless you ran it and saw the output. Paste real command results in the phase summary.

---

# PART 2 — NON-NEGOTIABLE PRINCIPLES

## 2.1 Privacy first

The platform must not hold secrets or sensitive data unnecessarily.

**Never store:** plaintext passwords; password-check input; unnecessary raw breach datasets; unnecessary copies of identifiers; provider responses longer than needed; raw leaked credentials of any kind.

**Always:** TLS; encryption at rest (field-level for identifiers — see 5.1); secure auth and cookies; strict server-side authorization; rate limiting; input validation; audit logging; minimal retention; secrets only via environment/secret manager.

## 2.2 Trust over gimmicks

The UI must always make clear: what was checked, what was *not* checked, when, which providers responded, whether results are complete, what the user should do, and what we store / don't store. Never exaggerate detection capability.

## 2.3 Legal & ethical guardrails

- **Ownership verification before any lookup.** A user can only scan an identifier after proving they control it (email link/OTP). The landing-page CTA "Check your exposure" leads to sign-up — there must be **no anonymous lookup of arbitrary emails** (this prevents the product being used to probe other people).
- Use only legitimate, documented provider APIs under their terms. No Tor/dark-web crawling, no scraping of leak repositories, no downloading breach dumps.
- Treat **sensitive breaches** (providers flag e.g. adult/dating/health sources) discreetly: hidden by default in lists, never named in email subjects or push notifications, revealed only inside the authenticated app after an explicit click.
- The user's identifier is necessarily sent to third-party providers. Disclose exactly which providers and what is sent in `/privacy` and `docs/PRIVACY-DATA-MODEL.md`.
- Document applicable privacy regimes (GDPR, India DPDP Act 2023) in `docs/PRIVACY-DATA-MODEL.md`: lawful basis/consent, deletion, export, and a processor list. This is documentation for a portfolio project, not legal advice — say so.

---

# PART 3 — SCOPE AND MILESTONES

The original plan contradicted itself about when monitoring is built. Use these milestones:

| Milestone | Contains | Phases |
|---|---|---|
| **M1 — MVP** | Auth, one email identity + ownership verification, manual scan, exposure engine (mock + 1 real provider), normalization/dedupe, risk score, dashboard, exposure details + remediation checklist, audit logs, rate limiting | 0–8 |
| **M2 — Continuous** | Redis + BullMQ worker, scheduled monitoring, change detection (new/changed/existing), email notifications + preferences, timeline | 9–10 |
| **M3 — Release hardening** | Full security review, UX polish, accessibility audit, final QA, docs, demo mode | 11–13 |
| **Later** | Multiple identities (UI), phone/username monitoring, password-exposure checker, domains, threat intel/phishing intel, exposure graph, extension, B2B | — |

In M1 the dashboard shows monitoring as **"Off — manual scans only"** (honest state), not a fake "Active".

**Data model must be multi-identity from day one** (`Identity.type` enum, many identities per user). The MVP UI and a server-side limit (default: 1 active identity/user, configurable) restrict it. Do not build in M1: browser extension, B2B, domain monitoring, dark-web crawling, Discord/Telegram/Slack, password reuse graph, payments.

---

# PART 4 — TECHNOLOGY DECISIONS (pre-made; deviate only with a documented reason)

## 4.1 Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (latest stable at build time; verify and record version), App Router, TypeScript `strict` |
| UI | React, Tailwind CSS, accessible primitives (Radix UI / shadcn-style, heavily customized — not default look), a motion library only where it aids understanding |
| Rendering | Server Components by default; Client Components only for interaction/state/browser APIs |
| Backend | Next.js Route Handlers + Server Actions as a *thin* layer over `server/services/*` |
| Database | **MongoDB + Mongoose**, running **locally** (MongoDB Community Server, browsed with Compass). Database name: `exovault`. See 4.5 for the local setup and its constraints. Do not switch databases without a documented, compelling reason |
| Queue | Redis + BullMQ. Redis for BullMQ must use `maxmemory-policy noeviction` |
| Validation | Zod, shared between client and server |
| Auth | Evaluate **Better Auth** (preferred: MongoDB adapter, email verification, passkeys, 2FA plugins) vs Auth.js. **Verify current maintenance status of each before choosing**, record in DECISIONS.md. Never implement crypto primitives yourself |
| Email | `EmailProvider` abstraction; SMTP/Mailpit in dev, a transactional provider in prod. Business logic never imports a vendor SDK directly |
| Logging | Structured JSON logger (e.g. pino) with redaction configured centrally |
| Tests | Vitest (unit/integration), Playwright (E2E), `mongodb-memory-server` (standalone, matching local dev), axe for accessibility |
| Tooling | ESLint, Prettier, `tsc --noEmit`, Husky/lint-staged, GitHub Actions CI |

## 4.2 Next.js-specific constraints (important)

- **Middleware/proxy runs on a limited runtime and cannot use Mongoose.** Use it only for coarse redirects and security headers. **Every route handler, server action, and server component that touches protected data must independently verify the session and ownership.** Never rely on middleware alone for authorization.
- **The BullMQ worker is a separate long-running Node process** (`workers/index.ts`, run via `tsx` in dev and built separately in prod). It must NOT run inside serverless route handlers. It shares code from `server/` via path aliases — configure a worker `tsconfig` accordingly.
- Server Actions get origin checking from Next.js; **Route Handlers do not** — implement explicit Origin/CSRF validation for cookie-authenticated mutating requests.
- A strict CSP with nonces requires dynamic rendering; evaluate the trade-off, choose deliberately, and document it. Do not paste a header template blindly.

## 4.3 Runtime modes and local dev

- MongoDB is **not** in docker-compose — it runs locally (see 4.5). `docker-compose.yml` provides only Redis (needed from M2) and Mailpit (dev email). Document the one-command start for these in the README, and a Windows/WSL note for Redis if I'm on Windows.
- `PROVIDER_MODE=mock | live`. In `mock` mode the app runs fully with deterministic providers — no API keys needed. **Any UI showing mock data must be visibly labelled "Demo data"** (trust principle).
- `scripts/seed.ts` creates a demo user with realistic mock exposures so reviewers can explore the product immediately.
- `.env.example` documents every variable (no real secrets). Validate env at startup with Zod and fail fast with a clear message.

## 4.4 Deployment target

Default assumption (document in `docs/DEPLOYMENT.md`): web app on a Node host or Vercel; MongoDB: local for development; for any deployed environment use a managed MongoDB (e.g. Atlas) or an authenticated self-hosted instance — never an open, unauthenticated one; managed Redis; worker on a container host (Fly.io/Railway/Render/VM). If deploying the web app to serverless, the worker MUST be hosted elsewhere. Provide a `Dockerfile` for web and worker.

## 4.5 Local MongoDB setup (decided)

- **Server:** MongoDB Community Server running on the dev machine. **Compass is only a GUI client** — it needs the MongoDB server running separately.
- **Connection string:** `MONGODB_URI=mongodb://127.0.0.1:27017/exovault` (the original `mongodb://localhost:27017/` has no database name, so Mongoose would silently use the default `test` database — always include `/exovault`). Prefer `127.0.0.1` over `localhost` to avoid IPv6 resolution problems on some systems.
- Add to `.env.example` (no secrets): `MONGODB_URI`, and a separate `MONGODB_URI_TEST` pointing to `exovault_test` (tests must never touch the dev database). Validate both at startup with Zod.
- **Standalone = no transactions.** A default local install is a standalone server, so multi-document transactions, change streams, and some Mongoose session features won't work. The design must not require them (see 14.1). *Optional:* a single-node replica set can be enabled locally later (`replSet` in `mongod.cfg` + `rs.initiate()`); the code must work on both setups, and the choice goes in `docs/DECISIONS.md`.
- **Local security:** bind to `127.0.0.1` only (the default; never `0.0.0.0`), no port-forwarding. Local dev may run without auth, but the code must support credentials in the URI so production uses a least-privilege authenticated user. Never commit real connection strings; saved Compass connections are not part of the repo.
- **Data hygiene:** local dev data is real-shaped. Use seeded mock data only (`scripts/seed.ts`) — never real breach data or real third-party emails in the dev database. Provide `npm run db:reset` and `npm run db:indexes` (syncs/creates indexes explicitly — don't rely on Mongoose auto-index in production).
- **Compass tip for reviewers:** after `npm run seed`, the `exovault` database should show collections for the models in 14.1; encrypted identifier fields must appear as ciphertext in Compass (a good visual proof of the privacy design — also assert this in a test).
- **Deployment note:** the app's data lives on this machine until a hosted database is configured; document backup (`mongodump`) and the migration path to Atlas in `docs/DEPLOYMENT.md`.

---

# PART 5 — DATA PROTECTION DESIGN

## 5.1 Identifier handling (this is the core privacy engineering)

For each monitored identifier store:

- `valueEncrypted` — AES-256-GCM field-level encryption, envelope/key-versioned (`keyId` stored), key from env/KMS, support key rotation.
- `valueBlindIndex` — HMAC-SHA-256 of the **normalized** value with a separate secret (pepper), used only for uniqueness checks/lookup. Never use a bare hash.
- `valueMasked` — precomputed display string (`k****n@example.com`). UI shows masked by default; full value only on explicit "reveal" within the authenticated session.
- Only the scan service decrypts, only for the duration of the provider call.
- Never put identifiers in URLs of *our* app, logs, error messages, analytics, or audit metadata (use identity IDs).

## 5.2 Default retention (put in `docs/PRIVACY-DATA-MODEL.md`; make configurable)

| Data | Default retention |
|---|---|
| Raw provider responses | **Not persisted** (memory only). Optional debug capture: non-prod only, TTL index ≤ 24h |
| Normalized exposures | Until identity deleted (or user deletes history) |
| Scan records | 12 months |
| Notifications | 90 days |
| Audit logs | 12 months; user reference anonymized after account deletion |
| Sessions | Per auth policy; expire/rotate |
| Deleted account | 7-day grace → hard-delete job (identities, exposures, scans, notifications, queue jobs); backups roll off ≤ 35 days |

Account deletion is a **real workflow**: confirmation, re-authentication, grace period, queued purge job, completion email, audit entry. Data export (JSON) is a real endpoint, not a placeholder button.

---

# PART 6 — AUTHENTICATION AND IDENTITY VERIFICATION

Two different verifications — keep them separate:

1. **Account email verification** — proves the user controls their login email.
2. **Identity (monitored identifier) ownership verification** — proves control of the identifier being scanned. If the identifier equals the verified account email, it may be auto-verified; otherwise send a single-use, short-TTL, hashed-at-rest token/OTP to that address.

Requirements: secure session cookies (`HttpOnly`, `Secure`, `SameSite=Lax` or stricter, `__Host-` prefix where possible), session rotation on login/privilege change, logout invalidates server-side, password policy per NIST 800-63B (length over composition; check against the Pwned Passwords range API server-side using k-anonymity at sign-up is acceptable — the plaintext is already on the server at that moment, so document the nuance), MFA-ready architecture (TOTP/passkeys), account-enumeration-safe responses on sign-in/sign-up/reset, verification and reset tokens single-use + expiring + stored hashed.

---

# PART 7 — EXPOSURE ENGINE (the most important subsystem)

## 7.1 Pipeline

```text
Identity → Decrypt (in memory) → Normalize → Validate
   → Provider adapters (parallel, per-provider timeout/retry/circuit-breaker)
   → Per-provider mapping to NormalizedExposure
   → Deduplicate (fingerprint) → Match/Merge with existing exposures
   → Classify severity → Risk scoring → Persist → Diff vs previous scan
   → Notify (only for NEW exposures)
```

## 7.2 Provider interface

```ts
interface ExposureProvider {
  getName(): string;
  getCapabilities(): { identifierTypes: IdentifierType[]; rateLimit: RateLimitSpec };
  search(identifier: SearchIdentifier, ctx?: ProviderContext): Promise<ProviderSearchResult>;
}

type ProviderSearchResult =
  | { status: "ok"; exposures: NormalizedExposure[]; checkedAt: Date }
  | { status: "error"; category: "rate_limited" | "unavailable" | "unauthorized" | "timeout" | "invalid_response"; retryable: boolean };
```

Provider-specific types and quirks never leak outside `server/providers/exposure/<name>/`. Adding a provider must not require changing engine logic.

Providers: `MockProvider` variants (Clean, SingleExposure, MultipleExposure, Duplicate, Failing, PartialFailure, SlowTimeout), `HIBPProvider` (first real provider — **verify the current API terms, pricing, key requirement, and rate limits before implementing and record them in `docs/PROVIDERS.md`**), then threat-intel/paste providers later. Per-provider: timeout, bounded retry with backoff + jitter, rate-limit awareness, circuit breaker, and a `ProviderState` record (health, last success, cooldown).

## 7.3 Normalized exposure

```ts
type NormalizedExposure = {
  provider: string;
  providerReference?: string;        // stable provider ID if available
  sourceName: string;
  sourceType: ExposureSourceType;    // breach | combo_list | stealer_log | paste | other
  discoveredAt: Date;                // when WE first saw it
  breachDate?: Date;
  addedToProviderAt?: Date;
  severity: ExposureSeverity;        // computed by OUR classifier, not trusted from provider
  exposedDataTypes: ExposedDataType[];
  isSensitiveSource: boolean;
  confidence: number;                // 0..1, defined in docs/EXPOSURE-ENGINE.md
  evidenceReference?: string;        // link to provider's public breach page — never raw data
};
```

## 7.4 Matching rules (document exactly)

Email normalization: trim; Unicode NFC; lowercase the **domain**; lowercase the local part for matching (document that this is the standard practical choice); IDNA/punycode for the domain; reject malformed input rather than "fixing" it. Do **not** strip `+tags` or dots from the local part for matching (it can cause false positives) — optionally record "possible alias" as separate metadata. Test each rule.

## 7.5 Deduplication

Deterministic `createExposureFingerprint()`: normalized source key + breach date (day precision) + provider reference where available + identity ID + sorted exposed-data categories. Handle: exact duplicates, same breach from different providers, slightly different source names ("Adobe" / "Adobe Inc."), and genuinely different exposures that must NOT merge. When merged, keep `providers: string[]` and the highest-confidence fields.

## 7.6 Severity classification (starting matrix — document and unit-test; adjust with reasons in DECISIONS.md)

| Severity | Typical triggers |
|---|---|
| **Critical** | Plaintext passwords, infostealer/stealer-log credentials, auth/session tokens, security answers, financial account data |
| **High** | Password hashes, government IDs, home address + phone, 2FA/backup codes metadata |
| **Medium** | Phone numbers, DOB, IP addresses, username + email combinations |
| **Low** | Email only, names, generic profile data |
| **Info** | Source known but no personal data categories confirmed |

Modifiers (documented, deterministic): very old exposures (> 7 years) may lower one level for *display* priority but never below Low; a sensitive-source flag changes presentation, not severity.

## 7.7 Exposure status model

Do not conflate these:

- **Detection state:** `NEW` → `EXISTING` → `CHANGED` (e.g., provider added data classes). A breach cannot be "resolved" by us; only mark `NO_LONGER_REPORTED` if a provider actually stops returning it, with a caveat.
- **Remediation state (user-driven):** `OPEN` → `IN_PROGRESS` → `REMEDIATED` | `DISMISSED` (with optional reason). Valid transitions are unit-tested.

"Active exposure" = detection state present AND remediation state not `REMEDIATED`/`DISMISSED`. Define once in code and docs.

---

# PART 8 — SCAN LIFECYCLE

Scan states (real, persisted, driven by actual job state — never faked):

```text
QUEUED → RUNNING → NORMALIZING → MATCHING → SCORING → COMPLETED
                                                   ↘ PARTIAL (≥1 provider failed, ≥1 succeeded)
                                                   ↘ FAILED  (all providers failed / fatal error)
```

- Each scan stores **per-provider sub-results** (`ok | error(category) | skipped`) and timestamps. UI shows "2 of 3 sources responded — results may be incomplete" with **Retry failed source**.
- **Idempotency & anti-abuse:** one active scan per identity (lock); manual-scan cooldown (default 15 min per identity); duplicate enqueue returns the existing scan.
- **Progress transport:** use Server-Sent Events (or short polling with backoff as fallback) reading persisted scan state. No tight polling loops. Clean up on unmount/disconnect.
- **Scan UI** displays real steps ("Preparing secure query ✓ / Checking sources ✓ / Normalizing … / Scoring …") mapped 1:1 to persisted states.
- Even in M1 (no scheduler), scans run through the queue abstraction (an in-process queue adapter is acceptable in M1 behind the same interface; BullMQ replaces it in M2 without changing callers).

---

# PART 9 — EXPOSURE RISK SCORE

A transparent, deterministic, proprietary **Exposure Risk Score**, 0–100. **Direction is fixed: 0 = lowest known risk, 100 = highest.** (The original example "74/100 MODERATE" was ambiguous — never show a score without its direction/label.)

Bands (starting point): 0–19 Minimal · 20–39 Low · 40–59 Moderate · 60–79 High · 80–100 Critical.

UI copy must say: *"Exposure Risk Score — calculated by Exovault from your known exposures. It is not an industry-standard security score."*

Factors: active credential exposure; sensitivity of exposed data; recency; number of active exposures (with diminishing returns); repeated exposure; password-hash exposure; phone exposure; MFA status (when user-reported); remediation status; password reuse where available. Remediated exposures contribute reduced (not zero) weight to reflect residual risk.

Requirements:
- Pure function `calculateRiskScore(input): { score, band, factors[] }` — no I/O, injectable `now` for deterministic tests. The `factors[]` output powers a "Why this score?" explainer in the UI.
- `docs/RISK-SCORE.md`: formula, every weight, worked examples, limitations, test-case table.
- Extensive unit tests incl. boundaries (0 and 100 clamps), monotonicity (adding an open exposure never lowers the score), remediation effects, recency decay, empty input.
- Persist score snapshots (`RiskScore`) with the methodology version, so history stays interpretable when weights change.

---

# PART 10 — MONITORING AND NOTIFICATIONS (M2)

- Schedules: every 6h / 12h / daily (configurable per identity). Compute `nextScanAt` with jitter to avoid thundering herd. Use BullMQ repeatable/scheduler jobs; the DB is the source of truth for schedule state; reconcile on worker boot.
- Worker: retries with backoff, dead-letter handling, graceful shutdown, structured job logs, concurrency limits, per-provider rate budget shared across jobs.
- Diff each scan against previous results → `NEW`, `CHANGED`, `EXISTING`. **Notify only for NEW or materially CHANGED exposures; never re-notify the same exposure** (dedupe key = `identityId + exposureFingerprint + channel`; notification sending is idempotent).
- `NotificationProvider` abstraction (`send(notification)`), email first; preferences per user (channel on/off, minimum severity, digest vs immediate, quiet hours). Respect timezone: **store UTC, display in the user's timezone**.
- Email content: what happened, severity, affected identity (masked), source (omitted if sensitive source), detected date, recommended action, link into app. No secrets, no raw data. Include unsubscribe/preferences link.
- Show "Monitoring is currently off" clearly when disabled; disabling cancels scheduled jobs.

---

# PART 11 — PASSWORD EXPOSURE CHECKER (later phase — design now, build later)

**The plaintext password must never reach our servers, logs, analytics, or error messages.**

```text
Password typed in browser → SHA-1 via Web Crypto in the browser
  → send ONLY the 5-char hash prefix to the range API (use padding if supported)
  → compare the returned suffixes locally in the browser → show result
```

- Prefer browser → provider directly (CSP `connect-src` allow-listing only that endpoint). If CORS prevents it, use a stateless proxy that only ever sees the prefix.
- Never store the hash or prefix. Exclude the page from analytics/session replay. Mask input, `autocomplete="off"`, clear the value after use.
- Dedicated security tests: assert no request body/URL/header sent to **our** API contains the password or full hash; assert nothing sensitive reaches logs.

---

# PART 12 — SECURITY REQUIREMENTS

Create `docs/THREAT-MODEL.md` (STRIDE per component: web app, API, worker, DB, Redis, email, providers; assets, trust boundaries, abuse cases such as "use the product to look up someone else's email", mitigations, residual risk) and keep it updated.

## 12.1 Authorization

Every protected resource is checked **server-side for ownership** using the session user — never trust client-supplied IDs. Repository functions take `userId` and scope queries by it (e.g. `findIdentityForUser(userId, id)`), returning *not found* (not forbidden) for others' resources. Prevent IDOR, horizontal and vertical escalation.

## 12.2 API pattern

```text
Request → request-ID → authenticate → authorize → rate-limit → validate (Zod, size limits) → service → DB/queue → typed response
```
Thin handlers; no business logic in routes or components. Safe error responses (no stack traces, no enumeration).

## 12.3 Rate limits (Redis-backed; defaults, configurable; fail closed for auth endpoints)

| Operation | Default |
|---|---|
| Sign-in | 5 / 15 min per IP + per account |
| Sign-up | 5 / hour per IP |
| Verification email resend | 3 / hour per account |
| Password reset request | 3 / hour per account + IP |
| Identity creation | 5 / day per user |
| Manual scan | 1 / 15 min per identity |
| Password-exposure check | per IP burst limit |
| Notification resend | 3 / hour |

## 12.4 Web & infrastructure security

XSS (no `dangerouslySetInnerHTML` on untrusted data), CSRF, injection (Mongo operator injection: validate types, reject `$`-prefixed keys, use `sanitize`-style guards), SSRF (no user-controlled outbound URLs; allow-list provider hosts), open redirects (allow-list `returnTo`), prototype pollution, unsafe deserialization. Security headers: CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS (prod), `frame-ancestors`/clickjacking protection — verified against the running app. Serve `/.well-known/security.txt`. Dependency hygiene: `npm audit`/OSV in CI, Dependabot, secret scanning (gitleaks) in CI and pre-commit. Least-privilege DB user; no secrets in repo.

## 12.5 Audit log and logging

Append-only `AuditLog` (never updated/deleted by app code), events include: `USER_CREATED, LOGIN_SUCCESS, LOGIN_FAILED, EMAIL_VERIFIED, IDENTITY_ADDED, IDENTITY_VERIFIED, SCAN_STARTED, SCAN_COMPLETED, SCAN_FAILED, EXPOSURE_DETECTED, MONITORING_ENABLED, MONITORING_DISABLED, NOTIFICATION_SENT, ACCOUNT_SETTINGS_CHANGED, DATA_EXPORTED, ACCOUNT_DELETION_REQUESTED, ACCOUNT_DELETED`. Store IDs and event metadata, **never** secrets, tokens, plaintext identifiers, or raw breach data.

Structured logs include: request ID, user ID (when safe), operation, duration, provider, scan ID, result state, error category. Central redaction list for passwords, tokens, cookies, API keys, identifiers. Add a test that scans captured logs for planted secrets.

---

# PART 13 — UX, ROUTES, AND DESIGN SYSTEM

## 13.1 Primary UX question

> "What does the user need to know or do next?"

Every page has one clear primary action. Progressive disclosure: **risk headline → what happened → what was exposed → why it matters → what to do → technical details.** Users must not need security expertise.

## 13.2 Primary journey

```text
Landing → Sign up → Verify account email → Welcome/security setup
 → Add first identity → Verify identity ownership → Initial scan (real progress)
 → Scan complete → Exposure summary → Exposure details → Remediation
 → Dashboard → (M2) Enable monitoring → Scheduled scan → New exposure? → Notify → Remediate
```

## 13.3 Routes

**Public:** `/`, `/how-it-works`, `/security`, `/privacy`, `/about` (static). `/pricing`: static "Free during beta" or omit. `/contact`: `mailto:` or minimal form with spam protection — do not build an unprotected form endpoint.

**Auth:** `/auth/sign-in`, `/auth/sign-up`, `/auth/verify-email`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/mfa` (adapt to the chosen auth library).

**Onboarding:** `/onboarding`, `/onboarding/identity`, `/onboarding/scan`, `/onboarding/results`.

**App:** `/app` (redirects to dashboard), `/app/dashboard`, `/app/exposures`, `/app/exposures/[id]`, `/app/identities`, `/app/identities/[id]`, `/app/monitoring`, `/app/timeline`, `/app/notifications`, `/app/settings/{profile,security,notifications,privacy}`. (The original also had `/app/security`, which duplicated `/app/settings/security` — removed; account-security actions live in settings.)

**Future (architect for, don't build):** `/app/org/*`.

## 13.4 Landing page

Hero: **"Know what is exposed. Know what to do next."** Primary CTA "Check your exposure" (→ sign-up); secondary "See how it works". Sections: hero, security-status visual, how it works, what can be monitored, example result (clearly marked *example*), privacy architecture, continuous monitoring, remediation, security principles + **limitations**, CTA, footer. No fake claims, no fake testimonials/logos/stats.

## 13.5 Dashboard

Answers "Am I exposed?" within seconds. Sections: Security status (score with direction + "Exposure Risk Score" label), severity breakdown (icon + label + count), monitoring status (state, last scan, next scan — or "Off"), recent exposures (source, severity, date, data types, status), recommended actions, recent activity. Example for illustration only (real values come from the scorer):

```text
EXPOSURE RISK SCORE      62 / 100   HIGH      (higher = more risk)
3 ACTIVE EXPOSURES       Critical 1 · High 1 · Medium 1 · Low 0
Monitoring: ACTIVE       Last scan 6 Oct 2026, 14:20 · Next scan 6 Oct 2026, 20:20
```

## 13.6 Exposure details and remediation

Source, severity, discovered date, breach date if known, confidence, **Exposed** vs **Not detected** data categories (with the caveat that "not detected" means not reported by the checked sources), "Why this matters", and a checkable remediation list (change password, update reused passwords, enable MFA, review account activity). Persist checklist progress; it feeds the risk score and the remediation state. Never show raw leaked credentials.

## 13.7 Timeline

Chronological, grouped by year/month; filters: severity, identity, source, date, remediation status; pagination/virtualization.

## 13.8 States (required for every feature)

Loading, success, empty, error, retry, unauthorized, forbidden, not-found, partial-failure. Specific cases: **no exposures** ("No known exposures detected in the N sources checked on [date]. Monitoring is on/off." — positive, not error-like, and never "you're safe"); many exposures (group/filter/sort/paginate, no 50 giant cards); scan failed (safe reason, retry, provider status); partial scan; monitoring disabled; identity verification pending (exactly what to do + resend); provider unavailable; never scanned (strong primary CTA); everything remediated (positive but professional).

## 13.9 Accessibility and responsiveness

WCAG 2.2 AA target: semantic HTML, full keyboard navigation, visible focus, labelled forms, accessible dialogs, live-region status announcements for scans, sufficient contrast, `prefers-reduced-motion`, **never color alone** (severity = color + icon + text label + optional pattern). Design mobile/tablet/desktop/large deliberately (not shrunk desktop): simplified nav, key risk first, touch-friendly targets, expandable sections instead of wide tables. Automated axe checks in E2E.

## 13.10 Visual identity

Premium cybersecurity-intelligence feel (SOC / threat-analysis / privacy-engineering), dark-first: near-black charcoal background, subtle surface elevation, one restrained accent, carefully chosen semantic severity colors, strong type hierarchy (choose a distinctive but legible type pairing with a monospace for technical data — **not** default Inter + purple gradient), precise spacing, subtle grid/noise/scanline details only where they serve the aesthetic.

Avoid: generic SaaS look, default Tailwind template, Linear/Vercel clones, glassmorphism overload, random gradients, neon cyberpunk everywhere, glowing borders, oversized rounded cards.

Use these skills **if installed** (check in Phase 0; if missing, follow this brief anyway and note it in PROGRESS.md): frontend-design, ui-ux-pro-max, Impeccable, Taste-Skill, code-simplifier.

Centralize design tokens as CSS variables (+ Tailwind theme): colors, severity/status colors, spacing, radius, type scale, shadows, motion. Motion only to aid understanding (scan progress, result reveal, expanders, notifications), always reduced-motion safe.

Reusable components (use judgment — no component per `<div>`): `SecurityScore, RiskBadge, SeverityBadge, ExposureCard, ExposureList, ExposureTimeline, MonitoringStatus, ScanProgress, IdentityCard, RecommendationCard, RemediationChecklist, EmptyState, ErrorState, LoadingState, SecurityEvent`.

---

# PART 14 — DATA MODEL, STRUCTURE, TESTING, DOCS

## 14.1 MongoDB models (review and optimize for Mongo; don't copy blindly)

`User, Identity, IdentityVerification, Breach (global catalog of known sources), Exposure (per identity, references Breach), RiskScore (snapshots, methodology version), Scan (with embedded per-provider results), MonitoringJob/Schedule, Notification, NotificationPreference, RemediationAction, AuditLog, ProviderState`.

Guidelines: embed what is read together and bounded (per-provider scan results, exposure data types); reference what is shared or unbounded (Breach, Identity → Exposure). Timestamps everywhere, schema validation, `strict` mode, no unbounded arrays. Justify each index (candidates: `userId`; `identityId + status`; unique `identityId + fingerprint`; `nextScanAt + monitoringStatus`; notification dedupe key unique; TTL indexes for retention). **Do not depend on multi-document transactions** (a standalone local MongoDB doesn't support them — see 4.5): design for single-document atomicity, unique indexes, idempotent upserts, and resumable jobs instead. Leave room for a future exposure graph (stable IDs for identity, source, data-type nodes) without implementing it.

## 14.2 Folder structure

```text
app/(marketing) (auth) (onboarding) (dashboard)/app/…   api/…
components/{ui,layout,dashboard,exposure,identity,monitoring,notifications,charts}
config/            # brand.ts, env.ts (validated), constants
lib/{auth,db,redis,security,validation,rate-limit,audit,crypto,logging,utils}
server/services/{exposure,identity,scan,monitoring,risk,notification,remediation}
server/providers/{exposure/{interface.ts,mock,hibp,…},notifications,email}
server/repositories/
models/
workers/{index.ts,queues,jobs,processors}
scripts/{seed.ts,…}
tests/{unit,integration,security,e2e,fixtures}
docs/…
.github/workflows/ci.yml
docker-compose.yml  Dockerfile(s)  .env.example  README.md
```
Keep names predictable; no needless abstraction folders; explain any deviation in DECISIONS.md.

## 14.3 Testing (every feature ships with tests — implement → test → fix → regress → continue)

- **Unit:** identifier normalization, validation, exposure normalization, `createExposureFingerprint`, `deduplicateExposures`, severity classification, `calculateRiskScore`, remediation transitions, schedule calculation, notification-preference logic, provider error mapping, `getRecommendedActions`.
- **Integration** (real local-style standalone MongoDB via `mongodb-memory-server`, plus Redis from M2): user → identity → scan → engine → DB for: success, no exposure, multiple, provider failure, partial failure, duplicates, unauthorized, nonexistent/deleted identity, disabled monitoring, scan lock/cooldown.
- **Security:** User A cannot read/modify User B's identities, exposures, scans, notifications, monitoring jobs, settings (IDOR matrix over every endpoint); unauthenticated access rejected; rate limits enforced; malformed input; NoSQL/operator injection; XSS payloads rendered inert; CSRF/origin checks; session misuse after logout; privilege escalation; sensitive-data leakage in responses and logs; secrets absent from logs; password data never reaching server APIs; account-enumeration-safe responses; **encrypted-at-rest check** (DB documents contain no plaintext identifier).
- **Provider contract tests:** every provider (mock and real, the latter against recorded fixtures) passes the same suite (input → response → normalization → expected internal exposure; error mapping).
- **E2E (Playwright):** sign up → verify email (via Mailpit API) → onboarding → add identity → verify → scan → results → open exposure → remediation → (M2) enable monitoring. Plus: no-exposure state, provider failure/partial failure, unauthorized access, mobile viewport, axe accessibility on key pages.
- **Deterministic fixtures and mock providers only** in automated tests — never live breach APIs.
- **CI** (GitHub Actions): install → lint → typecheck → unit → integration → security → build → E2E → dependency audit → secret scan. Required to pass before merge.
- Don't write tests that only mirror implementation details; assert behavior and invariants.

## 14.4 Observability and performance

Structured logging per Part 12.5; leave hooks for metrics, error tracking, queue monitoring. Avoid N+1 queries, unnecessary client fetching, big bundles, tight polling, repeated provider calls, duplicate scans. Use server rendering, safe caching (e.g. cache the public breach catalog, never per-user sensitive data in shared caches), pagination, indexes, debouncing.

## 14.5 Documentation (describe what actually exists — no aspirational claims)

`ARCHITECTURE, USER-FLOWS, API, DATABASE, SECURITY, THREAT-MODEL, PRIVACY-DATA-MODEL, RISK-SCORE, EXPOSURE-ENGINE, PROVIDERS, TESTING, DECISIONS, DEPLOYMENT, PROGRESS` (all in `docs/`), plus a portfolio-quality `README.md`: what it is, architecture diagram, screenshots/GIF, tech choices and *why*, how to run (one command), demo mode, security model summary, limitations, roadmap.

---

# PART 15 — IMPLEMENTATION PHASES

Each phase ends with the **phase gate** from 1.4.

| # | Phase | Output |
|---|---|---|
| 0 | Repository audit | Short assessment; skills check; `docs/PROGRESS.md` created |
| 1 | Architecture | ARCHITECTURE, DATABASE (design), THREAT-MODEL (initial), DECISIONS, folder structure, service boundaries, provider interface, docker-compose (Redis + Mailpit), env validation, CI skeleton |
| 2 | Design system | Tokens, typography, layout, nav, core components, all state components, accessibility baseline |
| 3 | Authentication | Sign-up/in/out, verification, sessions, protected routes, audit events, rate limits + tests |
| 4 | Identity | Add email, ownership verification, encrypted storage + blind index + masking, authorization + tests |
| 5 | Exposure engine | Provider interface, mocks, first real provider, normalization, fingerprint/dedupe, matching, severity, storage + comprehensive tests |
| 6 | Scanning | Scan lifecycle, persisted states, SSE progress, partial failures, locks/cooldown + integration tests |
| 7 | Dashboard | Score, breakdown, recent exposures, monitoring state, recommendations + E2E |
| 8 | Exposure details | Details page, remediation checklist, status transitions, score effects + tests — **M1 complete** |
| 9 | Monitoring | Redis, BullMQ, worker, schedules, diffing, new-exposure detection + worker tests |
| 10 | Notifications | Abstraction, email provider, preferences, idempotent alerts + tests — **M2 complete** |
| 11 | Security hardening | Full review against Part 12 (IDOR, auth bypass, XSS, CSRF, SSRF, injection, secret leakage, logging, rate-limit bypass, cookies, redirects, headers); fix; update THREAT-MODEL |
| 12 | UX polish | Audit spacing, type, hierarchy, a11y, mobile, states, motion; remove generic AI-looking patterns |
| 13 | Final QA | lint, typecheck, unit, integration, security, E2E, production build, seed + demo mode verified; docs verified against reality — **M3 complete** |

(Security work is continuous in every phase; Phase 11 is the dedicated full review, not the first time security is considered.)

---

# PART 16 — DEFINITION OF DONE AND ENGINEERING RULES

A feature is done only when: requirements understood → UX implemented → backend implemented → DB integrated → security reviewed → loading/empty/error states implemented → tests written and passing → typecheck, lint, build passing → docs updated.

**Do not:** duplicate business logic; put business logic in components or routes; log sensitive data; hardcode secrets; trust client-side authorization or client-supplied IDs; fake scan progress or provider results; silently swallow provider failures; claim unsupported capabilities; build out-of-scope features; create giant files; add meaningless abstractions; use `any` without justification; suppress TypeScript errors; disable lint rules to pass the build; write implementation-mirroring tests.

**Prefer:** clear code, small typed services, explicit errors, deterministic logic, reusable components, testable functions, documented decisions, secure defaults.

**Strongest engineering aspects to showcase:** (1) privacy-preserving identity handling, (2) exposure engine, (3) provider abstraction, (4) normalization, (5) deduplication, (6) risk scoring, (7) background monitoring, (8) secure authorization, (9) security testing, (10) UX, (11) production-quality frontend, (12) clear architecture.

---

# PART 17 — FINAL REPORT FORMAT

At the end of each milestone (and at the very end), output:

```text
IMPLEMENTATION SUMMARY
What was built / What remains
Architecture decisions
Database overview
API overview
Security controls
Testing results (real command output)
Known limitations
How to run locally
Environment variables required
Deployment instructions
Next recommended steps
```

Do not claim anything was implemented unless it exists in the repository and you have verified it.
