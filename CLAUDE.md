@AGENTS.md

# Exovault — standing rules for Claude Code

Full spec: `docs/MASTER-PROMPT.md` (read the relevant Part before each phase).
Progress lives in `docs/PROGRESS.md`; decisions in `docs/DECISIONS.md`. Read both at the start of every session.

## Project-specific notes (verified facts that override the spec where they conflict)

- Next.js **16.3.8**: `middleware.ts` is renamed **`proxy.ts`** and runs on the Node runtime by default. We still use proxy only for coarse redirects + security headers (see DECISIONS D-003); every handler re-checks session and ownership.
- Bundled Next.js docs are at `node_modules/next/dist/docs/` — consult them before using a Next API.
- Local MongoDB 8.2 is a **standalone** server at `mongodb://127.0.0.1:27017/exovault` — no transactions.
- Redis runs natively via Homebrew on this machine; Docker is optional (docker-compose is for Redis + Mailpit).
- Commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`.

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

