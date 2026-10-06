# Architecture Decision Log

Format: **Context → Options → Decision → Consequences.** Newest last. Status is `Accepted` unless marked.

---

## D-001 — Framework and library versions (2026-10-06)

- **Context:** Spec 4.1 asks for the latest stable versions, verified and recorded.
- **Decision:** Next.js **16.3.8** (App Router, Turbopack), React **19.2.8**, TypeScript **5.9.3** (`strict`), Tailwind CSS **4.3.3**, Zod **4.6.5**, Mongoose **9.11.0**, pino **10.4.0**, Vitest **4.1.11**. Node `>=22` (CI uses 22 LTS; the dev machine runs 25.2.1).
- **Consequences:** Next 16 differs from older docs: `middleware` is now `proxy` (D-003), and `LayoutProps`/`PageProps` are generated globals, so `typecheck` runs `next typegen` first. The bundled docs at `node_modules/next/dist/docs/` are the reference.

## D-002 — Authentication library: Better Auth (2026-10-06)

- **Context:** Spec 4.1 asks us to check both candidates are maintained before choosing.
- **Options:**
  - **Better Auth**: `better-auth@1.7.7`, last published 2026-09-30, a stable 1.x line. It has a MongoDB adapter, email verification, and 2FA/passkey plugins.
  - **Auth.js**: v5 is still `5.0.0-beta.32`. The stable `next-auth@4.24.15` (last modified 2026-07-20) targets the older patterns, and its email/password support is deliberately limited.
- **Decision:** Better Auth. We'll re-check the exact plugin APIs at the start of Phase 3 and record any differences here.
- **Consequences:** Session storage, email verification, and MFA come from the library; we don't write crypto primitives. Its tables become Mongo collections (`user`, `session`, `account`, `verification`). Our `User` profile data either extends them or links to them by ID (Phase 3 decides).

## D-003 — `proxy.ts` (formerly middleware) only handles headers and coarse redirects (2026-10-06)

- **Context:** Spec 4.2 assumes middleware can't use Mongoose. In Next 16, `proxy.ts` defaults to the Node.js runtime, so it technically could.
- **Decision:** We keep the spec's rule anyway. The proxy only sets security headers and the CSP nonce, and redirects visitors with no session cookie away from `/app/*`. Every route handler, server action, and protected server component checks the session and ownership itself.
- **Consequences:** One authorization path (the data-access layer), so it's harder to skip a check. No DB round-trip on every asset request.

## D-004 — Local standalone MongoDB; no multi-document transactions (2026-10-06)

- **Context:** Local MongoDB **8.2.2** is a standalone server (`rs.status()` → "not running with --replSet").
- **Decision:** Stay on standalone. The code must not rely on transactions or change streams. Consistency comes from single-document atomic updates, unique indexes (e.g. `identityId + fingerprint`), idempotent upserts, and resumable jobs. Tests use `mongodb-memory-server` in standalone mode.
- **Consequences:** A replica set (local or Atlas) also works, because nothing depends on replica-set-only features. Scan state transitions use conditional `findOneAndUpdate` (compare-and-set on `state`).

## D-005 — Shared domain vocabulary lives in `lib/domain/` (2026-10-06)

- **Context:** Severity, scan-state, and data-type enums are used by the UI, Zod schemas, Mongoose models, the engine, and the worker. The spec's folder tree has no obvious home for them.
- **Decision:** `lib/domain/*.ts` holds `as const` arrays plus derived types and tiny pure predicates (e.g. `isActiveExposure`). It has no I/O and imports nothing server-only.
- **Consequences:** One definition for each concept. It's safe to import from Client Components.

## D-006 — Providers return `ProviderExposure`, not `NormalizedExposure` (2026-10-06)

- **Context:** In spec 7.3, `NormalizedExposure.severity` is "computed by OUR classifier, not trusted from provider", yet 7.2 has providers return `NormalizedExposure[]`.
- **Decision:** Providers return `ProviderExposure`, which has no `severity` and no `discoveredAt`. The engine adds `provider`, `discoveredAt`, and the classifier's `severity` to produce `NormalizedExposure`.
- **Consequences:** The type system stops a provider from setting severity or discovery time. Contract tests check the mapping.

## D-007 — CSP: per-request nonce on all HTML routes (2026-10-06)

- **Context:** A strict nonce-based CSP forces dynamic rendering (see bundled `02-guides/content-security-policy.md`). Without nonces, `script-src` needs `'unsafe-inline'` for Next's inline bootstrap scripts.
- **Options:** (a) nonce everywhere, so every page renders dynamically; (b) nonce on app/auth pages and a weaker CSP for static marketing pages; (c) hash-based (SRI) experimental support.
- **Decision:** (a). App and auth pages are dynamic anyway because they depend on the session. The marketing pages are few and cheap to render. A security product showing `'unsafe-inline'` on its landing page undermines trust.
- **Consequences:** We lose static HTML caching and CDN edge caching for marketing pages, which is acceptable at portfolio scale. We'll revisit if SRI support becomes stable. Implemented in Phase 2/3 and checked against the running app in Phase 11.

## D-008 — Dependency audit scope (2026-10-06)

- **Context:** `npm audit` reports 5 high-severity findings, all in the dev-only lint chain: `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`. The suggested `audit fix --force` would downgrade to `eslint-config-next@14`.
- **Decision:** Don't force-downgrade. CI runs `npm audit --omit=dev --audit-level=high` as a blocking step. Dependabot tracks the dev chain.
- **Consequences:** That code doesn't ship in the app. We'll re-check at each phase gate.

## D-009 — Environment validation policy (2026-10-06)

- **Decision:** `config/env.ts` validates with Zod and fails fast. Error messages name the variable but never its value (tested). Empty `KEY=` lines count as unset. The encryption keyring is `keyId:base64` with comma-separated entries, ready for rotation. `MONGODB_URI*` must name a database, and the test DB must be different and end in `_test`. Crypto secrets are required in every environment, and `npm run env:init` generates them into `.env.local` (mode 600, never overwrites an existing file).
- **Consequences:** The dev server won't start until `env:init` has been run once. That's intended, because it stops anyone shipping with placeholder secrets.

## D-010 — Global Mongoose query hardening (2026-10-06)

- **Decision:** `mongoose.set("sanitizeFilter", true)` and `strictQuery: true`, set globally in `lib/db/mongoose.ts`. `autoIndex` is off in production; `npm run db:indexes` creates indexes explicitly (Phase 3+).
- **Consequences:** A `$`-prefixed object passed into a filter becomes a literal `$eq` match instead of an operator. Deliberate operators must be wrapped with `mongoose.trusted()`. Zod type validation at the edge stays the first line of defence.

## D-011 — Redis in local dev (2026-10-06)

- **Context:** The Docker daemon isn't running on the dev machine. Redis **8.4.0** runs natively (Homebrew) with `maxmemory-policy noeviction` (verified).
- **Decision:** `docker-compose.yml` still provides Redis + Mailpit for reviewers, and the native Redis works the same way. Nothing uses Redis until Phase 3 (rate limits) / Phase 9 (BullMQ).

## D-012 — HIBP terms are confirmed before Phase 5 (Status: Pending)

- **Context:** HIBP's breached-account API needs a paid API key. Spec 7.2 requires checking current terms, pricing, and rate limits before implementing.
- **Decision:** Phase 5 starts by checking these and writing them up in `docs/PROVIDERS.md`. The HIBP adapter is built and contract-tested against recorded fixtures, without a key. **Running it live needs a key from the project owner** (spec 1.4 stop condition (a)).
