# Progress

_Last updated: 2026-10-06 (end of Phase 2)_

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

## In progress

None.

## Blocked / needs owner input

- **HIBP API key** (paid). Needed only to run the live provider. Phase 5 builds and tests the adapter against fixtures without it (D-012).

## Next: Phase 3, authentication

Re-check Better Auth plugin APIs (D-002), then build sign-up/in/out, email verification via Mailpit, sessions, the `/app/*` proxy redirect and protected layouts, audit events, and Redis rate limits, with tests.
