# Progress

_Last updated: 2026-10-06 (end of Phase 3)_

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

## In progress

None.

## Blocked / needs owner input

- **HIBP API key** (paid). Needed only to run the live provider. Phase 5 builds and tests the adapter against fixtures without it (D-012).

## Next: Phase 4, identity

Add an email identity with ownership verification (auto-verified when it matches the verified account email), AES-256-GCM field encryption with key versioning, the HMAC blind index (`identity-blind-index` keyed-hash purpose already reserved), masking, the identity limit, identity-creation rate limit, onboarding routes, and an IDOR test matrix.
