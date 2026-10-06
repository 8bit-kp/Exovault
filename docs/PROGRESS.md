# Progress

_Last updated: 2026-10-06 (end of Phase 1)_

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

## In progress

None.

## Blocked / needs owner input

- **HIBP API key** (paid). Needed only to run the live provider. Phase 5 builds and tests the adapter against fixtures without it (D-012).

## Next: Phase 2, design system

Tokens (CSS variables + Tailwind theme), type pairing, layout shells for marketing/auth/app, navigation, the core and state components from spec 13.10, proxy.ts with security headers + CSP nonce (D-007), and an accessibility baseline. Replace the create-next-app boilerplate page.
