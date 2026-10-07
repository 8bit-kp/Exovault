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
- **Phase 3 re-check (2026-10-06):** APIs verified against the installed 1.7.7 source, not docs from memory. Details and the resulting choices are in D-018 and D-019. App-specific per-user data will live in our own collections keyed by the Better Auth user id; we don't extend the library's `user` schema.

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

## D-013 — Visual identity: dark-only, IBM Plex, one cyan accent (2026-10-06)

- **Context:** Spec 13.10 asks for a dark-first SOC/instrument feel with a distinctive type pairing (not Inter) and a mono face for technical data. None of the suggested design skills are installed (Phase 0).
- **Options:** (a) dark + light themes now; (b) dark only, tokens structured so light can be added; type: Geist (scaffold default), Inter, IBM Plex, Space Grotesk.
- **Decision:** (b) dark only, with `color-scheme: dark`. **IBM Plex Sans + IBM Plex Mono**, self-hosted through `next/font` (no third-party font requests, and `font-src 'self'` holds). One accent: a desaturated cyan (`oklch(0.83 0.1 200)`). Colours are OKLCH tokens in `app/globals.css`, and Tailwind's default palette is removed (`--color-*: initial`), so components can only use semantic tokens. Radii max out at 8px.
- **Consequences:** A user who prefers light mode gets dark. Adding light later means redefining the `--ev-*` variables under a media query; no component changes. Contrast is enforced by axe in E2E (the build fails on a violation).

## D-014 — CSP details: dev-only style relaxation, static headers in next.config (2026-10-06)

- **Context:** Implementing D-007 showed Turbopack's dev CSS hot reload injects `<style>` tags with no nonce. Browsers ignore `'unsafe-inline'` whenever a nonce is present in the same directive.
- **Decision:** Production `style-src` is `'self' 'nonce-…'`. Development `style-src` is `'self' 'unsafe-inline'` (no nonce), alongside dev-only `'unsafe-eval'` and `ws:`. The policy is built by a pure, unit-tested function (`lib/security/headers.ts`), and the proxy only applies it. Headers that don't vary per request (nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP/CORP, HSTS in prod) live in `next.config.ts` `headers()`, so static assets get them too. The root layout calls `connection()` so every page renders per request and receives a nonce.
- **Consequences:** No SSR'd `style=""` attributes anywhere. Dynamic geometry (score marker, scales) uses SVG attributes. A Playwright fixture fails any test on a console CSP violation against `next start`, so a regression can't slip through.

## D-015 — Minimal UI dependencies: native elements over Radix for now (2026-10-06)

- **Context:** Spec 4.1 suggests Radix/shadcn-style primitives and "a motion library only where it aids understanding".
- **Decision:** Phase 2 needs a modal drawer, checkboxes and form fields only. We use native `<dialog>` (`showModal()` gives focus containment, Escape, an inert background and focus restoration), native checkboxes, and CSS transitions. The only new runtime dependencies are `lucide-react` (icons) and `clsx`. No motion library yet; all motion is CSS and disabled under `prefers-reduced-motion`.
- **Consequences:** Smaller bundle and fewer CSP edge cases. If a later phase needs menus, popovers or comboboxes with complex keyboard models, add the specific Radix package then and record it here.

## D-016 — Public `/design-system` reference page (2026-10-06)

- **Context:** We need a place to review every component and state, run axe and contrast checks against real rendering, and take portfolio screenshots before the feature pages exist.
- **Options:** Storybook; a dev-only route; a public route.
- **Decision:** A public route group `app/(dev)/design-system` (plus app-shell and auth-shell previews) rendering real components with fictional data. Every data block carries the "Demo data" label, and the pages are `noindex`. It's public so the production-build E2E suite can test it.
- **Consequences:** No Storybook toolchain. The page contains no user data and no server calls. It can be removed or put behind a flag before a real launch.

## D-017 — Temporary auth stubs (2026-10-06)

- **Context:** The landing CTA points to `/auth/sign-up`, which Phase 3 builds. A 404 there breaks the primary journey and shows up as console errors from link prefetching.
- **Decision:** `/auth/sign-up` and `/auth/sign-in` render the real `AuthShell` with an honest "Accounts aren't open yet" notice and no inputs. Phase 3 replaces both. **Superseded in Phase 3:** both are real now and `NOT_YET_BUILT` is empty. `/app/*` links in the shell preview still 404; the E2E fixture lists them in `NOT_YET_BUILT`, and Phase 3 should empty that list.

## D-018 — Auth runs in-process through Server Actions; no `/api/auth` HTTP surface (2026-10-06)

- **Context:** Better Auth normally mounts `/api/auth/*`. Its built-in rate limiter only applies to that HTTP router, is per-process memory, and is per-IP only. Spec 12.3 needs Redis-backed, per-account and per-IP limits that fail closed.
- **Options:** (a) mount the handler and add limits in hooks; (b) call `auth.api.*` in-process from Server Actions and mount no handler.
- **Decision:** (b). Every credential flow is a Server Action: Zod validation → our Redis rate limits → `auth.api.*` → audit event → safe `FormState`. The verification code and reset token both come back to our own pages, so no auth HTTP route is needed. A test asserts no `app/**/api/auth/route.*` exists, and E2E asserts `POST /api/auth/sign-in/email` returns 404.
- **Consequences:** One code path, so the limits can't be bypassed by calling the library's HTTP endpoints directly. CSRF on these flows comes from Next's Server Action Origin/Host check. Better Auth's own origin middleware only runs on its router; we keep `disableOriginCheck: false` anyway. The client SDK isn't used. Cookies are set through the `nextCookies()` plugin.
- **Cookie details:**
  - Over HTTPS the session cookie is `__Host-exovault.session_token`. This requires `useSecureCookies: false`, otherwise Better Auth would prepend `__Secure-`; `secure` is then set explicitly through `defaultCookieAttributes`.
  - Over plain http (dev/E2E) the name is `exovault.session_token`.
  - The cookie is HttpOnly and SameSite=Lax. Cookie cache is off, so revocation takes effect on the next request.

## D-019 — Email verification by one-time code; reset links with hashed single-use tokens (2026-10-06)

- **Context:** Better Auth's default verification link is a stateless JWT. It carries the email address in the URL (spec 5.1) and can't be single-use or revoked (spec Part 6).
- **Decision:** Use the `emailOTP` plugin with `overrideDefaultEmailVerification`:
  - 6 digits, 10-minute expiry, 3 attempts per code.
  - `storeOTP: "hashed"`.
  - Verifying signs the user in.
  - Code checks share the sign-in rate-limit budget.

  Password reset uses the core flow: a 30-minute, single-use token stored as a SHA-256 hash (`verification.storeIdentifier: "hashed"`), with `revokeSessionsOnPasswordReset`. The verify page learns which address it's verifying from a 15-minute AES-GCM sealed HttpOnly cookie (`lib/crypto/sealed.ts`), never from the URL.

- **Password policy (NIST 800-63B):**
  - 12–128 characters, with no composition rules.
  - Screened against Pwned Passwords via the k-anonymity range API (`haveIBeenPwned` plugin, `PASSWORD_BREACH_CHECK=on`). Only the first 5 hex characters of the SHA-1 leave the server. The plaintext is necessarily on our server at that moment, which is the nuance the spec asks us to document.
  - Off in automated tests (no live third-party calls).
- **Enumeration safety:**
  - Sign-up returns the same result for new and existing addresses; the existing owner gets an "account exists" email instead.
  - Sign-in returns one message for a wrong password and for an unknown account.
  - Reset always reports "if an account uses that address…".
  - Emails are sent as background tasks, so response time doesn't depend on whether the account exists.

## D-020 — Redis fixed-window rate limiter, keys hashed (2026-10-06)

- **Decision:**
  - `lib/rate-limit` uses an atomic Lua `INCR` + `PEXPIRE` fixed window. The rules are in `config/rate-limits.ts` and match the spec 12.3 defaults.
  - Every auth rule is `failClosed`: if Redis is unreachable, the request is refused ("temporarily unavailable") and the auth library is never called.
  - Keys are `rl:<rule>:<HMAC(subject)>`, using an HKDF-derived subkey per purpose (`lib/crypto/keyed-hash.ts`), so Redis never holds raw emails or IPs.
  - The Redis client has a 2 s command timeout. At 1 s, a cold connection on a busy machine failed closed for legitimate users.
- **Consequences:** A fixed window allows up to 2× the limit across a window boundary. This is acceptable for these limits and much simpler than a sliding log; we'll revisit if abuse patterns need it.

## D-021 — Client IP and trusted proxies (2026-10-06)

- **Context:** Next.js fills `X-Forwarded-For` from the socket only if the client didn't send one. Next 16 has no `request.ip`.
- **Decision:** `TRUSTED_PROXY_COUNT` (default 0) chooses which XFF entry to trust: the n-th from the right, i.e. the one our nearest trusted proxy appended. Session rows store no IP at all (`disableIpTracking`). The audit log stores a keyed hash of the IP.
- **Consequences:**
  - **Residual risk:** with no proxy in front, a client can spoof its IP and dodge _per-IP_ limits. _Per-account_ limits still hold. Deploy behind a proxy and set the count (docs/DEPLOYMENT.md, Phase 13).
  - E2E runs with `TRUSTED_PROXY_COUNT=1` and a random XFF per test, simulating one proxy, so parallel tests don't share an IP budget. A dedicated test proves the 6th attempt is refused.

## D-022 — Audit log is append-only, best-effort, hashed (2026-10-06)

- **Decision:**
  - `models/AuditLog.ts` (collection `auditLogs`) uses `strict: "throw"`. Update and delete middleware throw, and a TTL index expires rows after 12 months.
  - Rows hold Better Auth user IDs, an event enum, the outcome, the request ID, and keyed hashes of the subject (e.g. the sign-in email, so repeated failures correlate) and the IP. No raw identifiers.
  - Writes are best-effort: a failed audit write is logged at error level but doesn't fail the user's sign-in.
- **Consequences:**
  - An outage of the audit store loses events rather than locking users out. Error-level logs make the gap visible.
  - Anonymisation after account deletion (spec 5.2) will need a privileged path that bypasses the model hooks. It arrives with account deletion.
  - TOTP and passkeys are deferred: Phase 3's scope is sign-up/in/out, verification, sessions, rate limits and audit. The settings page says "not available yet" honestly. Adding the `twoFactor` plugin is a drop-in change.

## D-023 — Identity ownership codes, and exactly where plaintext exists (2026-10-06)

- **Context:** Spec Part 6 #2 requires a single-use, short-TTL, hashed-at-rest proof of control for any identifier that isn't the verified account email. Spec 5.1 says "only the scan service decrypts".
- **Decision:**
  - **Auto-verify:** an identity equal (after normalization) to the _verified_ account email is verified immediately (`verificationMethod: "account-email"`).
  - **Everything else gets a code:**
    - 6 digits, generated with `crypto.randomInt`.
    - 15-minute expiry and 5 attempts per code.
    - Stored as a keyed HMAC bound to the identity ID (`identity-verification-code` purpose) and compared in constant time.
    - At most one live code per identity: a resend replaces it in one atomic upsert.
    - Each guess atomically spends an attempt (`$inc` with a conditional filter).
    - The code is consumed by a single-winner delete, so a double submit verifies once.
    - Limits: 10 guesses per 15 min per user, and 3 resends per hour per identity.
  - **Where plaintext exists.** It appears in memory only, at four points, all server-side:
    1. Creation (the user just typed it).
    2. A code resend: the email needs an address. This is a deliberate exception to "scan service only".
    3. An explicit, audited "Reveal" (`IDENTITY_REVEALED`). It's shown for 30 s, then re-masked.
    4. The scan service (Phase 6).

    It never appears in logs, URLs, audit metadata (identity IDs only), Redis keys or email subjects.

  - **Normalization:** NFKC, trim, lower-case. Gmail-style dot or `+tag` folding is deliberately not done, because each literal address is a distinct thing to prove ownership of.
  - **The same address under two users:** this is allowed, but each user must prove ownership independently. The blind index is unique per user only.
- **Consequences:** The verification email names no account, and it says plainly that ignoring it means nothing is checked.

## D-024 — Active-identity limit via a per-user counter document (2026-10-06)

- **Context:** "Count active identities, then insert" races without transactions (D-004). A test fires 4 concurrent adds.
- **Decision:**
  - `identityQuotas` has one document per user. A slot is claimed with a conditional `findOneAndUpdate({userId, active: {$lt: limit}}, {$inc: 1}, {upsert: true})`. At the limit, the upsert collides on the unique `userId` and the claim is refused.
  - The slot is released if the insert fails, and when an identity is removed.
  - Drift (e.g. a crash between claim and insert) self-heals: on a refused claim, the counter is recomputed from the real count once and the claim retried.
  - Duplicate addresses are blocked by a partial unique index on `{userId, type, valueBlindIndex}` where the status is active.
- **Consequences:** The limit holds under concurrency (tested: exactly 1 of 4 parallel adds succeeds). `MAX_ACTIVE_IDENTITIES_PER_USER` stays configurable; E2E uses 2.

## D-025 — Cross-user resources are a "soft 404" inside the app (2026-10-06)

- **Context:** App pages stream: the layout flushes before the page body, so `notFound()` renders the not-found UI with HTTP **200** plus `noindex` (documented Next 16 behaviour). A real 404 status would need the ownership check in `proxy.ts`, which D-003 rules out (no DB in the proxy).
- **Decision:** Accept the soft 404. Another user's identity renders exactly the same in-app "Not found" page as a non-existent ID. It shows no data and gives no different signal. E2E asserts this, including the `noindex` tag. Server Actions and services return `not_found` for both cases.
- **Consequences:** Status codes don't reveal existence either, since both cases return the same 200. Public, non-streamed routes still return a true 404.

## D-026 — Matching window and fingerprint contents (2026-10-06)

- **Context:** Spec 7.5 lists the sorted data categories and the provider reference as fingerprint inputs. Spec 7.7 also needs "provider added data classes" to be CHANGED, and spec 7.5 needs the same breach from different providers to merge. Data categories in the fingerprint would turn CHANGED into a second exposure. A provider reference in it would stop cross-provider merges.
- **Decision:** The fingerprint is identity + normalized source key + incident day. Matching to stored exposures uses a "same incident" predicate rather than exact fingerprint equality: same source key, with dates within 31 days or either date unknown. That tolerates providers that disagree by a few days on the incident date. The fingerprint is the stable ID assigned at first sight, and the unique index makes inserts idempotent.
- **Consequences:**
  - Two genuinely separate incidents at one source more than 31 days apart stay separate.
  - Two incidents at the same source within 31 days would merge. That's rare, and a merged record still points the user at the right account.

## D-027 — HIBP mapping choices (2026-10-06)

- **Decision:**
  - HIBP "Passwords" → `password_hash` (High). HIBP doesn't say whether passwords were hashed or plaintext. Mapping it to plaintext would make nearly every breach Critical and dilute the signal. The remediation advice ("change this password and any reuse") is the same either way.
  - Fabricated breaches (`IsFabricated`) and retired breaches are dropped.
  - Spam lists become source type `other` with confidence 0.5.
  - Stealer logs and malware become `stealer_log`, which is Critical.
  - Our matrix adds "home address alone → Medium", which the spec's matrix doesn't list.
  - The provider's HTML description is never stored: only plain-text fields we map.
- **Consequences:** Severity may understate breaches that did leak plaintext passwords. The evidence link to HIBP's breach page gives the detail.

## D-028 — Demo providers, demo flag, seed, and the NFC correction (2026-10-06)

- **Decision:**
  - **Demo mode:** `PROVIDER_MODE=mock` uses two deterministic demo providers over a fictional catalog. Every result is persisted with `isDemo: true` on both the exposure and the catalog row. From Phase 7, the UI must show "Demo data" for these.
  - **Seed:** `npm run seed` refuses production and refuses live mode. It creates `demo@exovault.example` through the public auth API and marks it verified, adds the identity, and runs a real engine check against the demo providers.
  - **Scripts:** they run with `tsx --conditions=react-server`, so modules guarded by `server-only` load.
  - **NFC correction:** spec 7.4 requires NFC and an IDNA/punycode domain. Phase 4's normalizer used NFKC with no IDNA, so it was corrected. Blind indexes for addresses whose NFC and NFKC forms differ would change; nothing deployed is affected.
- **Consequences:** Demo results are reproducible across machines. Tests and the seed never touch a live API.

## D-029 — Scan execution in M1: in-process queue, real step boundaries, SSE (2026-10-07)

- **Context:** Spec Part 8 asks for persisted, never-faked states, one active scan per identity, a 15-minute manual cooldown, SSE progress, and a queue abstraction (in-process allowed in M1).
- **Decision:**
  - **Queue:** `ScanQueue` with an in-process adapter (concurrency 4). Starting a scan validates, takes the lock, and enqueues, then returns immediately. BullMQ replaces the adapter in M2 behind the same interface.
  - **Step boundaries:** each persisted state brackets real work.
    - `running`: provider calls. Each source's result is written as it settles.
    - `normalizing`: dedupe.
    - `matching`: match and persist.
    - `scoring`: the active-by-severity rollup now; the risk score joins it in Phase 7.

    Transitions are compare-and-set, so a second processor can't run a scan twice (tested).

  - **Lock:** a unique partial index on `active: true`. The flag is set while the scan isn't terminal and unset at the terminal state. A duplicate or concurrent start returns the scan already in progress.
  - **Interrupted scans:** an active scan with no progress for 2 minutes (e.g. after a restart) is failed as `interrupted` on the next start, releasing the lock.
  - **Cooldown:** 15 minutes per identity for manual scans. Failed scans don't count. "Retry failed source" isn't a manual scan: it rescans only the failed providers, is linked via `retryOfScanId`, and is limited to 3 per hour per identity.
  - **Progress:** `GET /api/scans/:id/events` (SSE) reads the persisted scan once a second on the server and emits only on change. It ends at a terminal state, at 5 minutes, or on disconnect. The client falls back to `GET /api/scans/:id` with exponential backoff (1 s up to 10 s). Both endpoints check the session and ownership: 401 for anonymous users, 404 for other users' scans.
  - **Route:** `/app/scans/[id]` shows progress and results. It isn't in spec 13.3's route list; it's the natural home for a scan.
  - **Exposure links:** exposure cards render without links until detail pages exist (Phase 8).
- **Consequences:** The in-process queue needs a long-running Node server (`next start`, container). On serverless the work could be cut off after the response, so deploying serverless needs M2's separate worker (DEPLOYMENT.md, Phase 13).

## D-030 — Risk score design, snapshots, recommendations, activity (2026-10-07)

- **Decision:**
  - **Score:** a saturating score `100·(1−e^(−raw/45))` over severity weights with recency, remediation and detection multipliers, geometric diminishing returns (0.7) and three small compounding bonuses. The formula and every constant are in RISK-SCORE.md; property tests cover monotonicity.
  - **Scope:** user-level (all identities), recomputed in each scan's `scoring` step and when an identity is removed. Phase 8 adds remediation changes.
  - **Snapshots:** kept 12 months, matching scans.
  - **Recommendations:** `getRecommendedActions` is pure, returns at most 5 actions, one per concern, most severe first, and never names a sensitive source.
  - **Recent activity:** a projection of the user's own audit events, with descriptions built from counts and IDs, so no identifiers appear.
- **Consequences:**
  - The score moves with remediation (Phase 8 records a snapshot per change).
  - MFA affects the score only when the user reports it, which isn't collected yet. "Unknown" is shown, not assumed.

## D-031 — Remediation: checklist-driven state, explicit overrides (2026-10-07)

- **Context:** Spec 13.6 wants a checkable list that "feeds the risk score and the remediation state". Spec 7.7 defines open → in progress → remediated | dismissed.
- **Decision:**
  - **Checklist:** generated per exposure from its data categories and source type (`getRemediationChecklist`, pure, stable keys). Each ticked item is a `remediationActions` row, unique on (exposure, item).
  - **State follows the checklist:** none ticked = open, some = in progress, all = remediated. Unticking moves a remediated exposure back to in progress. A **dismissed** exposure stays dismissed until it's reopened.
  - **Explicit overrides:** "Mark as fixed", "Dismiss" (a reason from a fixed list is required) and "Reopen", validated against the transition table (unit-tested).
  - **Atomicity:** state changes are compare-and-set on the current state, retried once after a concurrent change.
  - **Side effects:** every change stores a risk-score snapshot (`reason: "remediation"`) and a `REMEDIATION_UPDATED` audit event.
  - **Scans never touch remediation state** (tested).
  - **Sensitive sources:** the name is withheld from the detail view model and the page title until "Reveal" (audited, `SENSITIVE_SOURCE_REVEALED`).
  - **Demo mode:** an address containing `sensitive` deterministically includes the fictional sensitive source, for demos and E2E.
- **Consequences:** Remediation is reversible and auditable, and the score reflects it immediately. "Dismissed" keeps half weight in the score, because nothing was fixed (RISK-SCORE.md).

## D-032 — BullMQ worker and scheduled monitoring (2026-10-07)

- **Context:** M2 needs scheduled scans and a worker that isn't the web process (spec 4.2, Part 10). M1's in-process queue (D-029) must keep working for single-server development.
- **Decision:**
  - **Queue choice:** `SCAN_QUEUE=inline | bullmq` picks the `ScanQueue` adapter; callers don't change.
    - With `bullmq`, the web process only enqueues `{ scanId }`. Jobs use the ID `scan-<id>` (dedupe), 3 attempts with exponential backoff, and failed jobs are kept 7 days (dead letters).
    - The processor is idempotent (compare-and-set `queued → running`), so retries and duplicates are harmless.
  - **Worker (`workers/index.ts`):** a separate Node process with its own `tsconfig.worker.json`. It runs under `tsx` in development and as an esbuild bundle in production (`node --conditions=react-server dist/worker.mjs`).
    - Scan concurrency is limited (`WORKER_CONCURRENCY`).
    - The monitoring tick runs as a BullMQ job scheduler (`MONITORING_TICK_MS`), plus once at boot.
    - On SIGTERM/SIGINT it shuts down gracefully, finishing in-flight jobs within 30 s.
    - Scheduled scans the worker starts go through BullMQ too.
  - **Schedule:**
    - The database is the source of truth: `identities.monitoring {enabled, frequency 6h|12h|24h, nextScanAt}`.
    - Each due identity is claimed with a compare-and-set on `nextScanAt`, which moves forward by the interval ±10% jitter. Concurrent ticks never double-schedule (tested).
    - After downtime, an overdue identity gets one scan, not one per missed slot.
    - Turning monitoring on schedules the first check within 1–5 minutes, or continues from a recent scan.
    - Turning it off cancels scheduled scans that haven't started (`failureReason: "cancelled"`).
    - Scheduled scans skip the manual cooldown; the schedule is their limit.
  - **States:** monitoring is `active`, `off`, or `degraded` (on, but the last scheduled scan failed).
  - **Timeline** (spec 13.7): server-side filters (severity, status, source type, identity, month range) validated strictly from the URL, pagination 20 per page, grouped by month, and works without JavaScript.
- **Consequences:**
  - The web app can now run on serverless with `SCAN_QUEUE=bullmq`, provided the worker runs on a container host (DEPLOYMENT.md).
  - E2E runs the real worker (`SCAN_QUEUE=bullmq`), so every E2E scan crosses web → Redis → worker → MongoDB.
  - Notifications for NEW / CHANGED exposures are Phase 10. Scans already persist the diff they need.

## D-033 — Exposure alerts: what triggers them, delivery guarantees, unsubscribe (2026-10-07)

- **Context:** Spec Part 10: alert only on NEW or materially CHANGED exposures, never re-alert, idempotent sending, preferences (channel, minimum severity, digest, quiet hours, timezone), safe email content, and an unsubscribe link.
- **Decision:**
  - **Triggers:** alerts come from **scheduled** scans only. A manual scan's results are already on screen, so emailing them is noise.
    - "Materially changed" means the **severity went up**: persistence reports these as `diff.escalated`. New data that doesn't raise severity doesn't alert.
  - **Never twice:** the dedupe key is `identityId:fingerprint:channel:event`, unique-indexed, where the event is `new` or `changed:<severity>`.
    - The same exposure never alerts twice for the same event, and each escalation level alerts at most once.
    - Creation is an idempotent upsert.
  - **Preferences:**
    - Defaults: email on, minimum severity Medium, immediate delivery, quiet hours off, UTC.
    - They're stored per user and **re-checked at send time**, so turning email off also stops queued alerts.
    - Quiet hours handle windows that cross midnight. Times are evaluated in the user's IANA timezone via Intl, to minute precision; on a DST change day the deferral can be off by the shift.
    - The digest is one email at 08:00 local time.
  - **Dispatch (worker, a BullMQ job scheduler every `NOTIFICATION_DISPATCH_MS`):**
    - Each due row is claimed by compare-and-set, `pending → sending` (tested with concurrent dispatchers).
    - It's grouped into one email per user per run, then sent.
    - On failure it's retried with backoff (5, then 10 minutes) and marked `failed` after 3 attempts.
    - Rows stuck in `sending` for more than 10 minutes go back to pending. Delivery is **at-least-once**: a worker that dies between the SMTP send and the database update can send one duplicate. Exactly-once isn't possible across SMTP.
  - **Content:**
    - Sent to the **account email** (the verified sign-in address), not the monitored address.
    - Subjects carry no identifier, source or detail. Bodies show the masked identity, omit sensitive source names, and include the detection time in the user's timezone, the first checklist step and a deep link.
    - Nothing is stored: content is rendered at send time.
  - **Unsubscribe:**
    - Every alert has a body link to a confirmation page, which never acts on GET (link scanners), and `List-Unsubscribe` / `List-Unsubscribe-Post` headers pointing to `POST /api/notifications/unsubscribe` (RFC 8058).
    - Both carry a sealed, purpose-bound token, valid 90 days, that can only switch alert email off. That route skips the Origin check: there's no cookie session to abuse, and replaying it is harmless.
  - **Retention:** notifications are kept 90 days (TTL). The inbox is `/app/notifications`.
  - **Layering:** server code must not import UI components. A lucide icon import crashed the worker under the `react-server` condition. An ESLint rule now blocks non-type `@/components` imports in `server/`, `lib/`, `workers/` and `models/` (verified to fire).
  - **Timezones:** pickers show modern IANA names (`Asia/Kolkata`, not ICU's `Asia/Calcutta`).
- **Consequences:**
  - Alerts are only as timely as the monitoring schedule plus one dispatch interval.
  - Everything outside the alerts, inbox and alert settings still shows UTC, clearly labelled. Showing the user's timezone everywhere is a Phase 12 item.

## D-034 — Email verification is bound to the sign-up that set the password (2026-10-07)

- **Context:** The Phase 11 review found **pre-account hijacking**:
  1. An attacker signs up with a victim's address and a password they know. The account stays unverified.
  2. When the victim signs up later, they get the generic response, click "resend", and enter the code.
  3. That verifies the _attacker's_ account and signs the victim in. The attacker's password still works, so they can later read whatever the victim adds.

  Related: a verified account could be signed into with an emailed code alone, with no password.

- **Decision:**
  - A new account gets a random **sign-up nonce**. Its keyed hash is stored in `pendingSignups` (1-hour TTL); the plaintext lives in the browser's sealed pending-verification cookie. A password sign-in on an unverified account (which proves the password) issues a fresh nonce.
  - `verifyEmailCode` and `resendVerificationCode` act only when the nonce matches. Otherwise verify returns the same "invalid" result, and resend silently sends nothing.
  - Signing up with an existing **unverified** address doesn't create, change or verify anything. The mailbox gets a **set-your-password link** instead of a code.
  - Completing a password reset is mailbox proof: it marks the account verified, clears pending binds, and revokes all sessions. That replaces whatever password was set before, so the attacker is locked out.
  - `beforeEmailVerification` refuses already-verified accounts, so an emailed code can never sign into one.
  - Every sign-up branch runs a password hash, so timing doesn't reveal which branch ran. Responses stay identical (no enumeration).
- **Consequences:**
  - Someone who signs up on one device and verifies on another must sign in with their password on the second device first. That re-binds it and sends a fresh code.
  - Proven by `tests/security/account-takeover.test.ts`, which walks through the full attack and the claim.

## D-035 — Phase 11 hardening batch (2026-10-07)

**Abuse and limits.** New limits (`config/rate-limits.ts`), all fail-closed:

| Limit                                                | Where                                    | Value       |
| ---------------------------------------------------- | ---------------------------------------- | ----------- |
| Sign-up per **email**                                | sign-up                                  | 3 / hour    |
| Ownership codes per **target address** (blind index) | identity add and resend                  | 5 / day     |
| Code guesses per target address                      | identity verify                          | 10 / 15 min |
| Reset submit per IP                                  | password reset                           | 10 / hour   |
| Reveals per user                                     | identity reveal, sensitive-source reveal | 30 / hour   |
| Unsubscribe per IP                                   | route + confirmation page                | 20 / hour   |
| Scan streams opened per user                         | SSE                                      | 30 / 5 min  |

**Fixes:**

- **SSE:** the stream re-checks the session every 10 ticks, so revoked sessions stop receiving updates.
- **Reset links:** a reset checks the new password against the breach list **before** Better Auth spends the single-use token. Previously a breached password burned the link.
- **GCM tags:** both sealed tokens and field encryption require full 16-byte tags (`authTagLength: 16`). Truncated tags made unsubscribe-token forgery feasible.
- **Cookie deletion over HTTPS:** the pending-verification cookie is now cleared with matching attributes. A `__Host-` cookie can't be deleted without `Secure`, so the old delete silently failed. It's also cleared on sign-out.
- **Sensitive sources:** evidence links (which embed the breach name) are withheld for sensitive sources, and list and timeline view models carry no sensitive names.
- **Evidence URLs:** only absolute `https:` URLs are kept at ingestion, and the schemas enforce it.
- **Request IDs:** client-supplied `x-request-id` values are accepted only as UUIDs, and audit `requestId` is capped. Requests the proxy skips could otherwise inject values.
- **ObjectIds:** parsing is strict and round-trips (`lib/db/object-id.ts`) everywhere.
- **Scoping:** the cooldown helper is scoped by user.
- **Logging:** the worker logs error names only, header-like keys are added to redaction, and scrubber input is capped.
- **Production secrets:** production refuses all-zero keys and test/CI secrets unless `EXOVAULT_ALLOW_TEST_SECRETS=1`, which only CI sets.
- **New endpoints and headers:** `/.well-known/security.txt` (RFC 9116), a deny-all CSP on `/api/*`, and a narrow gitleaks allowlist for one fake test URI.

**Accepted residual risks** (documented in SECURITY.md):

- **Targeted lockout:** the per-account sign-in limit enables lockout (5 bad passwords lock the owner out for 15 minutes). That's the trade-off for brute-force protection; a CAPTCHA step is the upgrade path.
- **Spoofable per-IP limits** without a trusted proxy (D-021).
- **Session tokens** are stored in plaintext by the library.
- **Soft 404s** for cross-user URLs (D-025).
