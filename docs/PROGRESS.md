# Progress

_Last updated: 2026-10-07 (end of Phase 12)_

## Phase 0: Repository audit (done)

**What existed:** an empty directory. No git repo, no `package.json`, no code.

**Environment found on the dev machine:**

| Tool       | Version / state                                                                     |
| ---------- | ----------------------------------------------------------------------------------- |
| Node / npm | 25.2.1 / 11.7.0                                                                     |
| MongoDB    | Community Server 8.2.2, running at 127.0.0.1:27017, **standalone** (no replica set) |
| Redis      | 8.4.0, running natively, `maxmemory-policy noeviction`                              |
| Docker     | installed, **daemon not running** (compose file still provided)                     |
| git        | 2.50.1                                                                              |

**Skills check (spec 13.10):** `frontend-design`, `ui-ux-pro-max`, `Impeccable`, `Taste-Skill`, and `code-simplifier` are **not installed**. The available skills are document/artifact skills plus `simplify`, `code-review`, and `security-review`. Phase 2 follows the spec's visual brief directly. Phase 11 can use `security-review`, and `simplify` can stand in for code-simplifier.

**Reused:** nothing (greenfield). **Missing:** everything. The Next.js app was scaffolded with `create-next-app@16.3.8`.

## Phase 1: Architecture (done)

Built and verified:

- [x] Next.js 16.3.8 + TS strict + Tailwind 4 + ESLint (with Prettier) scaffold
- [x] `docs/ARCHITECTURE.md`, `docs/DATABASE.md` (design), `docs/THREAT-MODEL.md` (initial), `docs/DECISIONS.md` (D-001…D-012)
- [x] `config/brand.ts`, `config/env.ts` (Zod, fail-fast, value-free errors), `scripts/env-init.ts`
- [x] `lib/domain/exposure.ts` (shared enums, `isActiveExposure`)
- [x] `server/providers/exposure/interface.ts` (provider contract, D-006)
- [x] `lib/logging/logger.ts` (pino + central redaction)
- [x] `lib/db/mongoose.ts` (verified: connects to local `exovault`)
- [x] `docker-compose.yml` (Redis noeviction + Mailpit), `.env.example`
- [x] CI skeleton (`.github/workflows/ci.yml`: lint, format, typecheck, unit, build, prod audit, gitleaks) + Dependabot
- [x] Unit tests: env validation, log redaction, active-exposure definition

Folders from spec 14.2 are created when their first file lands. We don't commit empty placeholder folders.

## Phase 2: Design system (done)

Built and verified (see `docs/DESIGN-SYSTEM.md`, decisions D-013 to D-017):

- [x] Tokens as OKLCH CSS variables + Tailwind 4 `@theme`, with the default palette removed; IBM Plex Sans/Mono via `next/font`; motion tokens, all reduced-motion safe
- [x] Layouts: marketing (header/footer), `AuthShell`, `AppShell` (sidebar + native `<dialog>` mobile drawer), `PageHeader`, skip link
- [x] Spec 13.10 components: `SecurityScore`, `RiskBadge`, `SeverityBadge`, `ExposureCard`, `ExposureList`, `ExposureTimeline`, `MonitoringStatus`, `ScanProgress`, `IdentityCard`, `RecommendationCard`, `RemediationChecklist`, `EmptyState`, `ErrorState`, `LoadingState`, `SecurityEvent` (+ `AccessState`, `SeverityBreakdown`, `Callout`, `Field`)
- [x] Landing page (spec 13.4) replaces the create-next-app boilerplate; global 404 and error boundary
- [x] `proxy.ts`: per-request nonce CSP. `next.config.ts`: static security headers. Policy built by a tested pure function
- [x] `lib/domain/risk.ts` (score bands), `lib/domain/monitoring.ts`, deterministic UTC formatting
- [x] `/design-system` reference page plus shell previews (fictional data, labelled)
- [x] Tests: Vitest split into `node` and `components` (jsdom + axe) projects; Playwright E2E against `next start` (CSP/nonce/headers, axe incl. contrast on every public page at desktop and mobile, keyboard skip link, drawer focus restore, no horizontal scroll, landing claims); CI runs E2E

**Known gaps / carried forward:**

- `/auth/sign-in` and `/auth/sign-up` are honest "not open yet" stubs (D-017). Phase 3 replaces them and the `/app/*` routes, and empties `NOT_YET_BUILT` in `tests/e2e/fixtures.ts`.
- Landing copy describes controls that later phases build: field encryption and blind index (Phase 4), checklist persistence (Phase 8), export and delete (settings). Re-verify the copy against reality in Phase 13.
- The proxy doesn't redirect `/app/*` yet, because the session cookie name comes with Better Auth (Phase 3).
- Dark theme only (D-013).

## Phase 3: Authentication (done)

Built and verified (see `docs/SECURITY.md`, decisions D-018 to D-022):

- [x] Better Auth 1.7.7 re-checked against installed source (D-002); Mongo adapter without transactions; `nextCookies`
- [x] Sign-up, email verification by hashed one-time code (emailOTP plugin), sign-in, sign-out, forgot/reset password with hashed single-use tokens and session revocation
- [x] Enumeration-safe responses on sign-up, sign-in and reset; "account exists" and "password changed" emails
- [x] NIST-style password policy (12–128 chars) + Pwned Passwords k-anonymity check (configurable; off in tests)
- [x] Credential flows run in-process from Server Actions; no `/api/auth` HTTP surface (D-018)
- [x] Redis rate limits per spec 12.3, keyed by HMAC, fail closed (D-020); trusted-proxy-aware client IP (D-021)
- [x] Append-only `auditLogs` with hashed subject/IP and a 12-month TTL (D-022)
- [x] `__Host-` session cookie over HTTPS; sessions store no IP; Settings → Security lists and revokes sessions (IDOR-safe)
- [x] Protected `/app` layout + pages (`requireSession` everywhere); proxy redirect + request IDs; honest dashboard ("Monitoring: Off", "Not yet scored") and "not available yet" sections
- [x] `EmailProvider` abstraction (SMTP/Mailpit, in-memory for tests)
- [x] `npm run db:indexes` (explicit indexes incl. TTLs), `npm run db:reset -- --yes` (local only)
- [x] Tests: Vitest `integration` project on in-memory standalone MongoDB + Redis DB 15 (flows, hashing at rest, single use, enumeration, rate limits, fail-closed, audit); Playwright journeys through Mailpit (sign-up → code → dashboard → sessions → sign-out → sign-in, reset, replayed cookie, forged cookie, open redirect, 6th attempt blocked)
- [x] CI: MongoDB, Redis and Mailpit service containers; unit, integration and E2E steps
- [x] Docs: SECURITY.md, PRIVACY-DATA-MODEL.md (account data), DATABASE.md and THREAT-MODEL.md updated

**Known gaps / carried forward:**

- No MFA (TOTP/passkeys) yet; the settings page says so (D-022).
- Better Auth stores session tokens in plaintext in `session` (library behaviour; see SECURITY.md).
- Per-IP limits are spoofable without a trusted proxy (D-021).
- Onboarding (`/onboarding/*`) arrives with identities in Phase 4; verified users land on the dashboard for now.
- Landing-page copy still mentions controls built in later phases (identifier encryption, export and delete). Re-verify in Phase 13.
- Local E2E is load-sensitive on a busy machine: the auth spec runs serially with generous timeouts, and local runs use 4 workers.

## Phase 4: Identity (done)

Built and verified (decisions D-023 to D-025):

- [x] `Identity`, `IdentityVerification` and `IdentityQuota` models (multi-identity and multi-type schema; email only in the product)
- [x] AES-256-GCM field encryption with versioned keyring and AAD bound to the record; `npm run keys:rotate` (compare-and-set re-encryption)
- [x] Keyed-HMAC blind index over the normalized value (NFKC, trim, lower-case); precomputed mask
- [x] Ownership verification: account email auto-verified (only if the account is verified); other addresses get a 6-digit code (keyed HMAC, 15 min, 5 attempts, single-winner consume)
- [x] Atomic active-identity limit (configurable, default 1), identity-creation and code rate limits, audited reveal and removal
- [x] Onboarding (`/onboarding`, `/onboarding/identity`, `/onboarding/scan` as an honest placeholder), `/app/identities` list and add, `/app/identities/[id]` (reveal, verify, resend, remove with confirmation), dashboard reflects real identity state, in-app not-found
- [x] Tests: unit (crypto, tamper, AAD, rotation, normalization); integration (ciphertext at rest, codes hashed and single-use, attempts, expiry, resend, concurrency limit, double submit, AAD swap, rotation); security IDOR matrix; E2E (onboarding with account email, second address via Mailpit code, limit, reveal/hide, remove dialog, cross-user URL reveals nothing)

**Known gaps / carried forward:**

- `/onboarding/results` and real scanning: Phases 5–6. `/onboarding/scan` says scanning isn't available yet.
- Soft 404 for cross-user URLs (D-025).
- `scripts/seed.ts` (spec 4.3) needs exposures, so it lands in Phase 5.
- Landing-page copy: encryption and masking claims are now true. Export and delete are still pending (re-verify in Phase 13).

## Phase 5: Exposure engine (done)

Built and verified (docs/EXPOSURE-ENGINE.md, docs/PROVIDERS.md, decisions D-026 to D-028):

- [x] HIBP terms, pricing (Core 1: 10 RPM, $4.39/mo), key/User-Agent requirements, CC BY 4.0 attribution checked and recorded (D-012 resolved for the build; a live key is still needed to run it)
- [x] HIBP adapter: fixed endpoint, Zod-validated responses, data-class mapping, error mapping incl. Retry-After; fabricated/retired breaches dropped, HTML never stored. Contract-tested against fixtures recorded from HIBP's public breach endpoints
- [x] Mock scenarios (clean, single, multiple, duplicate, failing, partial-failure, slow-timeout) and deterministic demo providers over a fictional catalog
- [x] One provider contract suite run against every provider
- [x] Email normalization corrected to spec 7.4 (NFC, IDNA domain, reject malformed)
- [x] Severity classifier (spec 7.6 matrix, monotonicity-tested) + display-only age modifier
- [x] Source-key normalization, fingerprint, same-incident matching, deterministic dedupe/merge
- [x] Engine: parallel providers, per-attempt timeout, bounded retry with jitter, circuit breaker (`providerStates`), shared Redis rate budget, partial results
- [x] `Breach` catalog, `Exposure` (idempotent upserts, detection states new/changed/existing/no_longer_reported, remediation untouched), cascade delete with the identity
- [x] `checkIdentityExposures` orchestrator: verified identities only, decrypt in memory, failed checks write nothing, `EXPOSURE_DETECTED` audit
- [x] `npm run seed`: demo account + identity + demo exposures (mock mode only, refuses production)
- [x] Tests: unit (normalization, severity, source key, fingerprint, dedupe, resilience, provider contract); integration (end to end against MongoDB: clean, multiple, duplicates, cross-provider merge, partial/total failure, timeout, idempotency, concurrent runs, changed, no-longer-reported, remediation preserved, shared catalog, unverified/foreign identities, circuit breaker open/close, rate budget, no identifier at rest, audit)

**Known gaps / carried forward:**

- The scan lifecycle (persisted states, progress over SSE, lock, cooldown) is Phase 6. Nothing in the UI triggers a check yet.
- The UI must show "Demo data" for `isDemo` exposures and HIBP attribution wherever HIBP data appears (Phase 7).
- Live HIBP needs the owner's paid key (D-012).
- Risk score (`calculateRiskScore`) and `RiskScore` snapshots are Phase 7.

## Phase 6: Scanning (done)

Built and verified (D-029):

- [x] `Scan` model: persisted states with history, per-provider sub-results written as each source settles, summary, failure reason, 12-month TTL
- [x] Compare-and-set transitions over an explicit state machine (`lib/domain/scan.ts`); each state brackets real work
- [x] One active scan per identity (unique partial index), duplicate and concurrent starts return the running scan, interrupted-scan recovery
- [x] 15-minute manual cooldown (failed scans don't count); "Retry failed source" (only the failed providers, linked, 3/h)
- [x] `ScanQueue` interface + in-process adapter; processor is safe to run twice
- [x] SSE progress endpoint + JSON fallback (session + ownership; 401/404); client EventSource with backoff polling fallback and cleanup
- [x] UI: onboarding first scan → live progress → results (`/onboarding/results`), `/app/scans/[id]`, dashboard latest-scan panel (run / cooldown / watch), recent exposures, real `/app/exposures` list, identity page scan panel; "Demo data" labels; HIBP attribution component; honest clean / partial / failed states
- [x] Tests: integration (full lifecycle and step history, clean, partial, failed, cooldown, failed-scan cooldown, reuse, concurrent starts, double processing, stale recovery, retry, retry limits, IDOR, no identifier in scans, audit); E2E (first-scan journey through demo providers, clean wording, partial + retry, endpoint authorization)
- [x] Docs: API.md (new), DECISIONS D-029, DATABASE, ARCHITECTURE, SECURITY

**Known gaps / carried forward:**

- Risk score, "Why this score?", recommendations, recent activity: Phase 7.
- Exposure detail pages + remediation checklist: Phase 8 (cards aren't links until then).
- In-process queue needs a long-running server; serverless needs the M2 worker (D-029).

## Phase 7: Dashboard (done)

Built and verified (D-030, docs/RISK-SCORE.md):

- [x] `calculateRiskScore`: pure, injectable `now`, explainable `factors[]`, methodology version; 22 unit tests including worked examples, bounds, clamping, 500-case monotonicity, order independence, diminishing returns, remediation/recency/detection/MFA effects, and factors summing to the score
- [x] `RiskScore` snapshots: written in the scan's scoring step and on identity removal; current vs previous for direction of change
- [x] `getRecommendedActions`: pure, prioritised, bounded, de-duplicated, never names sensitive sources; unit-tested
- [x] Recent activity projected from the user's own audit events (no identifiers)
- [x] Dashboard (spec 13.5): score with direction, band and disclaimer, "Why this score?", active-by-severity breakdown, monitoring Off, recommended actions, latest scan, recent exposures with attribution, recent activity, "Demo data" label; states for no identity / pending / unscanned / clean / everything handled
- [x] Tests: integration (snapshots, clean = 0, identity removal, isolation, counts, ordering, activity projection); E2E (before and after the first scan, explainer, axe on both); visual check desktop + mobile

**Known gaps / carried forward:**

- Remediation checklist + status transitions that move the score: Phase 8.
- Exposure detail pages (cards still not links): Phase 8.
- Timeline page (spec 13.7) is still a placeholder; it's grouped/filtered history and lands with Phase 8/12 polish.

## Phase 8: Exposure details (done). M1 complete.

Built and verified (D-031):

- [x] `/app/exposures/[id]`: headline (severity + rule), what to do, why it matters, what happened (dates, masked address, sources, confidence), exposed vs not-detected (with caveat), technical details, evidence link, attribution, "Demo data"
- [x] Remediation state machine (spec 7.7, unit-tested), per-exposure checklist from exposed categories, `remediationActions` persistence, checklist-driven state, mark fixed / dismiss with reason / reopen, compare-and-set
- [x] A score snapshot and an audit event on every change; scans never touch remediation; cascade delete with the identity
- [x] Sensitive sources hidden everywhere until an explicit, audited reveal
- [x] Exposure cards link to details (dashboard, exposures list, scan and onboarding results)
- [x] Tests: unit (transitions, checklist, derived state); integration (detail, hidden sensitive name + audited reveal, checklist → states → falling score, untick, idempotency, foreign items, dismiss reasons, invalid transitions, rescan preserves remediation, cascade, IDOR); E2E (checklist → In progress → Remediated → score falls, reload persistence, sensitive reveal, dismiss, cross-user URL)
- [x] Docs: TESTING.md, USER-FLOWS.md, DEPLOYMENT.md (first version), D-031, DATABASE, API, SECURITY, PRIVACY-DATA-MODEL

**Known gaps / carried forward (M2+):** scheduled monitoring and the worker (Phase 9), notifications (Phase 10), timeline page (spec 13.7, an M2 item), data export / account deletion workflow (spec 5.2), MFA, live HIBP key.

## Phase 9: Monitoring (done)

Built and verified (D-032):

- [x] BullMQ adapter behind `ScanQueue` (`SCAN_QUEUE=inline|bullmq`): IDs-only payloads, dedupe job IDs, retries with backoff, 7-day dead-letter retention
- [x] Worker process (`workers/`): own tsconfig, `npm run worker` / `worker:build` (esbuild), concurrency limit, monitoring tick as a job scheduler + at boot, graceful shutdown (smoke-tested with SIGTERM)
- [x] Scheduling: frequencies 6h/12h/24h, ±10% jitter (unit-tested), DB as source of truth, compare-and-set claims, downtime reconciliation, cancel on disable, degraded state
- [x] `/app/monitoring` (enable with frequency / disable), real monitoring state on the dashboard, identity page and identity cards; landing copy updated
- [x] `/app/timeline` (spec 13.7): grouped by month, server-side validated filters, pagination, no-JS form
- [x] Tests: unit (schedule); integration (worker end to end, scheduler, concurrency, reconciliation, cancellation, degraded, IDOR, timeline filters/pagination/validation); E2E now runs the real worker (all scans cross web → BullMQ → worker), plus monitoring on/off and timeline specs
- [x] CI builds the worker; docs updated

**Known gaps / carried forward:** email notifications + preferences + idempotent alerts (Phase 10). Dockerfiles for web and worker (Phase 13). Data export / account deletion, MFA, live HIBP key.

## Phase 10: Notifications (done). M2 complete.

Built and verified (D-033):

- [x] `NotificationProvider` abstraction (email first, over `EmailProvider`); alert and digest templates (masked identity, sensitive sources unnamed, no identifiers in subjects, deep links, RFC 8058 unsubscribe headers)
- [x] Alerts from scheduled scans for NEW and escalated exposures; dedupe key (identity + fingerprint + channel + event), idempotent creation
- [x] Preferences: email on/off, minimum severity, immediate / daily digest, quiet hours (cross-midnight), IANA timezone; re-checked at send time
- [x] Worker dispatch: compare-and-set claims, one email per user per run, retries with backoff then failed, stale-claim recovery (at-least-once)
- [x] `/app/notifications` inbox (status explained per alert, mark all read), `/app/settings/notifications`, public unsubscribe page + one-click POST route
- [x] Layering guard: ESLint forbids UI component imports in server/worker code (after a real worker crash); timezone picker with modern IANA names
- [x] Tests: unit (dedupe, material change, suppression, quiet hours incl. timezone, digest timing, timezone list); integration (14 notification tests incl. concurrency and real rendering); E2E (preferences, inbox, unsubscribe page + one-click endpoint); axe found and fixed a colour-only link

**Known gaps / carried forward (M3+):** user-timezone display beyond alerts and the inbox (Phase 12), data export / account deletion workflow (spec 5.2), MFA, Dockerfiles (Phase 13), live HIBP key.

## Phase 11: Security hardening (done)

Review and fixes (SECURITY.md "Phase 11 security review", D-034, D-035):

- [x] Three-part review (authz/IDOR, injection/output, secrets/logging/cookies/limits) plus headers checked against a running production build; 13 findings fixed (2 medium), 2 accepted as residual risks
- [x] **Pre-account hijacking fixed:** email verification bound to the password-setting sign-up; set-password claim path; codes never sign into verified accounts
- [x] Limits per target address and per email, reset-submit limit, reveal and unsubscribe caps, SSE stream cap + session re-check
- [x] Breach pre-check before spending a reset token; 16-byte GCM tags; HTTPS-safe cookie clearing; sensitive names withheld from evidence links and list models; https-only evidence URLs; UUID-only request IDs; strict ObjectIds; production refuses test secrets
- [x] `/.well-known/security.txt`, deny-all CSP on `/api/*`, gitleaks config
- [x] Tests: account-takeover, abuse-limits, planted-secret log scan, hardening unit tests, CSRF E2E (foreign-Origin Server Action refused), pending-cookie cleared check on every E2E sign-up

**Known gaps / carried forward:** user-timezone display beyond alerts (Phase 12), data export / account deletion workflow (spec 5.2), MFA, Dockerfiles (Phase 13), live HIBP key. The `security-review` skill couldn't run (it needs an `origin` remote); the manual three-part review replaced it.

## Phase 12: UX polish (done)

Screenshot review of every app page on desktop and mobile, with fixes (D-036):

- [x] Times shown in the user's chosen timezone everywhere in the app (offset-labelled), plus a "use this device's timezone" shortcut
- [x] Plain-language severity reasons (methodology `2026-10.2`)
- [x] Unread count badge on Notifications; route-level loading skeleton
- [x] Duplicated checklist heading and step count removed; responsive detail rows and activity timestamps; natural-width settings buttons
- [x] Copy updated now that email alerts exist; dead `NotYetAvailable` component removed
- [x] Seed runs a real manual scan, so a fresh demo shows a last-scan time and timeline entries
- [x] Review run: no console errors, no 4xx and no horizontal scroll on 10 app pages × 2 viewports

**Gate:** lint, format, typecheck (app + worker), 356 unit/component tests, 149 integration tests, worker build, 0 production-audit vulnerabilities. E2E: 121 passed and 1 failed in the full run; 2 are skipped by design. The failure was the mobile CSP check on `/design-system/app-shell`. It passed 3/3 when re-run alone and is recorded as an open flake.

**Carried forward:** data export / account deletion workflow (spec 5.2), MFA, Dockerfiles (Phase 13), live HIBP key, investigate the CSP-spec flake.

## In progress

None.

## Blocked / needs owner input

- **HIBP API key** (paid; Core 1 is enough for development). Needed only to run the live provider.

## Next: Phase 13, final QA and release

Dockerfiles for web and worker, verified demo mode, docs checked against the running product, final QA pass, and the M3 report.
