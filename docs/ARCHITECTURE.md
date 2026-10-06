# Architecture

> Status: **Phase 4.** Built: identities (encrypted storage, blind index, masking, ownership verification, onboarding; §6). Also built: the UI layer ([DESIGN-SYSTEM.md](DESIGN-SYSTEM.md)), `proxy.ts` (CSP, request ID, coarse `/app` redirect), and authentication ([SECURITY.md](SECURITY.md)): Server Actions → `server/services/account` → Better Auth in-process, Redis rate limits, audit log. Each section says whether it is **built** or **designed**. Nothing marked _designed_ exists in code yet.

## 1. System overview

```text
                 ┌───────────────────────── Browser ─────────────────────────┐
                 │  Server-rendered pages + small Client Components            │
                 │  (password checker, later: hashes in-browser, k-anonymity)  │
                 └───────────────┬────────────────────────────────────────────┘
                                 │ HTTPS, __Host- session cookie
┌────────────────────────────────▼──────────────────────────────────────────────┐
│ Next.js 16 web process                                                         │
│  proxy.ts ── security headers, CSP nonce, coarse redirects (no authz)          │
│  app/ (RSC pages)   app/api/* (Route Handlers)   Server Actions                │
│        └──────────────┬─────────────────────────────┘  thin: authn → authz →   │
│                       ▼                                 rate-limit → Zod →     │
│  server/services/*  (business logic: identity, scan, exposure, risk, …)        │
│  server/repositories/* (every query scoped by userId)                          │
│  server/providers/*  (exposure providers, email, notifications)                │
│  lib/* (crypto, db, logging, validation, rate-limit, audit, auth)              │
└───────┬─────────────────────────┬───────────────────────────┬─────────────────┘
        │                         │ enqueue                   │ outbound (allow-listed hosts)
        ▼                         ▼                           ▼
   MongoDB (exovault)        Redis (BullMQ, rate limits)   HIBP / mock providers, SMTP
        ▲                         │
        │                         ▼
┌───────┴──────────────────────────────────────────┐
│ Worker process (workers/index.ts, separate Node) │  M2: scheduled scans,
│ shares server/* via path aliases                  │  notifications, purge jobs
└───────────────────────────────────────────────────┘
```

## 2. Layering rules

| Layer                                     | May import                                                    | Must not                                                   |
| ----------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| `app/**` (pages, route handlers, actions) | `server/services`, `lib/auth`, `lib/validation`, `components` | contain business logic; query models directly              |
| `components/**`                           | `lib/domain`, `config/brand`, UI primitives                   | import `server/**`, `models/**`, secrets                   |
| `server/services/**`                      | repositories, providers, `lib/*`, `lib/domain`                | read `process.env` directly (use `config/env`)             |
| `server/repositories/**`                  | `models/**`, `lib/db`                                         | return another user's data (every function takes `userId`) |
| `server/providers/exposure/<name>/**`     | `interface.ts`, `lib/*`                                       | leak provider-specific types beyond their folder           |
| `workers/**`                              | `server/**`, `lib/**`, `config/**`                            | be imported by `app/**`                                    |
| `lib/domain/**`                           | nothing with I/O                                              | import server-only code                                    |

## 3. Request pipeline (designed; spec 12.2)

`request-ID → authenticate → authorize (ownership in the repository query) → rate-limit → validate (Zod, size limits) → service → DB/queue → typed response`.
Errors map to safe categories (`not_found`, `rate_limited`, `invalid_input`, `conflict`, `unavailable`), with no stack traces and no enumeration. Another user's resource returns **not found**, never forbidden.
Route Handlers that change state check `Origin` explicitly. Server Actions rely on Next's built-in origin check.

## 4. Exposure engine (designed; spec Part 7)

```text
Identity ─decrypt in memory─▶ normalize ─▶ validate
  ─▶ providers in parallel (timeout · bounded retry w/ jitter · circuit breaker · shared rate budget)
  ─▶ ProviderExposure[] ─▶ engine adds provider + discoveredAt + OUR severity  (D-006)
  ─▶ fingerprint & dedupe ─▶ match/merge with stored exposures (upsert on identityId+fingerprint)
  ─▶ risk score snapshot ─▶ diff vs previous scan (new / changed / existing) ─▶ notify NEW only (M2)
```

Contract: `server/providers/exposure/interface.ts` (**built**). Adding a provider means adding a folder and registering it. The engine doesn't change.

## 5. Scan lifecycle (designed; spec Part 8)

Persisted states `queued → running → normalizing → matching → scoring → completed | partial | failed` (`SCAN_STATES` in `lib/domain/exposure.ts`, **built**). Transitions use compare-and-set (`findOneAndUpdate({_id, state: from}, {state: to})`), so a second worker can't advance a scan twice. Without transactions (D-004), each step is resumable.

- M1: an in-process queue adapter behind a `ScanQueue` interface.
- M2: a BullMQ adapter behind the same interface.
- Progress: SSE reads persisted state. The UI never invents steps.

## 6. Privacy-preserving identifier storage (**built**, Phase 4; spec 5.1)

| Field                      | How                                                                                                | Purpose                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `valueEncrypted` + `keyId` | AES-256-GCM, random 96-bit IV, AAD = `identityId`, key from keyring (`IDENTIFIER_ENCRYPTION_KEYS`) | recoverable only by the scan service, in memory only |
| `valueBlindIndex`          | HMAC-SHA-256(normalized value, `BLIND_INDEX_PEPPER`)                                               | uniqueness / lookup without plaintext                |
| `valueMasked`              | precomputed `k****n@example.com`                                                                   | default display                                      |

Key rotation: new writes use the active key id. `npm run keys:rotate` (`server/services/identity/key-rotation.ts`) rewrites old rows with a compare-and-set. Reads pick the key by stored `keyId`. Code: `lib/crypto/field-encryption.ts`, `lib/crypto/keyed-hash.ts`, `server/services/identity/identity-service.ts`; where plaintext may exist is listed in D-023.

## 7. Process & runtime model

| Process | Runs                                                    | Status                               |
| ------- | ------------------------------------------------------- | ------------------------------------ |
| Web     | `next dev` / `next start`                               | scaffolded                           |
| Worker  | `tsx workers/index.ts` (dev), separate container (prod) | designed (M2)                        |
| MongoDB | local Community Server 8.2 standalone                   | running locally, connection verified |
| Redis   | native 8.4 or `docker compose up -d`                    | available, unused until Phase 3      |
| Mailpit | `docker compose up -d`                                  | configured                           |

## 8. What exists today (Phase 1)

- `config/brand.ts`: product identity in one place.
- `config/env.ts`: Zod-validated env, fail-fast, value-free error messages.
- `lib/domain/exposure.ts`: shared enums and `isActiveExposure`.
- `lib/logging/logger.ts`: pino with central redaction.
- `lib/db/mongoose.ts`: cached connection, `sanitizeFilter`, `strictQuery`, no prod auto-index.
- `server/providers/exposure/interface.ts`: provider contract.
- `scripts/env-init.ts`, `docker-compose.yml`, `.github/workflows/ci.yml`, `.github/dependabot.yml`.
- Unit tests for env validation, log redaction, and the active-exposure definition.
