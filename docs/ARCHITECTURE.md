# Architecture

> Status: **M3 complete (Phase 13).** Every section below describes code that exists, unless it says _designed_ or _later_. Built: authentication ([SECURITY.md](SECURITY.md)), identities (§6), the exposure engine (§4), scanning (§5), the dashboard and Exposure Risk Score ([RISK-SCORE.md](RISK-SCORE.md)), exposure details and remediation, the BullMQ worker and scheduled monitoring, alerts and preferences, the timeline, data export and account deletion (§9), the public information pages, and container images (§7).

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
│ Worker process (workers/index.ts, separate Node) │  scans, scheduled monitoring,
│ shares server/* via path aliases                  │  alert dispatch, account purge
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

## 3. Request pipeline (**built**; spec 12.2)

`request-ID → authenticate → authorize (ownership in the repository query) → rate-limit → validate (Zod, size limits) → service → DB/queue → typed response`.
Errors map to safe categories (`not_found`, `rate_limited`, `invalid_input`, `conflict`, `unavailable`), with no stack traces and no enumeration. Another user's resource returns **not found**, never forbidden.
Route Handlers that change state check `Origin` explicitly. Server Actions rely on Next's built-in origin check.

## 4. Exposure engine (**built**, Phase 5; spec Part 7, see [EXPOSURE-ENGINE.md](EXPOSURE-ENGINE.md) and [PROVIDERS.md](PROVIDERS.md))

```text
Identity ─decrypt in memory─▶ normalize ─▶ validate
  ─▶ providers in parallel (timeout · bounded retry w/ jitter · circuit breaker · shared rate budget)
  ─▶ ProviderExposure[] ─▶ engine adds provider + discoveredAt + OUR severity  (D-006)
  ─▶ fingerprint & dedupe ─▶ match/merge with stored exposures (upsert on identityId+fingerprint)
  ─▶ risk score snapshot ─▶ diff vs previous scan (new / changed / existing) ─▶ notify NEW only (M2)
```

Contract: `server/providers/exposure/interface.ts` (**built**). Adding a provider means adding a folder and registering it. The engine doesn't change.

## 5. Scan lifecycle (**built**, Phase 6; spec Part 8, D-029)

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

| Process | Runs                                                                                                                      | Image                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Web     | `next dev` · `next start` · in the container, Next's standalone `server.js` (`NEXT_OUTPUT=standalone`)                    | `Dockerfile` (multi-stage, non-root) |
| Worker  | `npm run worker` (dev, tsx) · `node --conditions=react-server dist/worker.mjs` (prod). Never inside serverless functions. | `Dockerfile.worker`                  |
| MongoDB | local Community Server 8.2, standalone (D-004); managed or authenticated self-hosted in any deployment                    | not containerised by this repo       |
| Redis   | native or `docker compose up -d`; BullMQ queues and every rate limit (`maxmemory-policy noeviction`)                      | `docker-compose.yml` (dev)           |
| Mailpit | `docker compose up -d` or the native binary; dev and E2E email only                                                       | `docker-compose.yml` (dev)           |

The worker runs four kinds of job: scans (`scans` queue) and three periodic jobs on the `monitoring` queue, namely the monitoring tick, alert dispatch, and the account purge. `SCAN_QUEUE=inline` runs scans inside the web process instead, for single-process development. The periodic jobs only ever run in the worker, so scheduled monitoring, alert emails and the account purge need it running whatever `SCAN_QUEUE` is set to.

## 8. Request-scoped display timezone

Dates are rendered on the server. `requireSession()` loads the user's timezone from their notification preferences into a per-request store (`lib/auth/request-timezone.ts`, React `cache`), and the formatters in `lib/utils/format.ts` read it by default. Code outside a request (worker, scripts, tests) formats in UTC. Emails pass the recipient's timezone explicitly (D-036).

## 9. Account lifecycle: export and deletion (**built**, Phase 13; spec 5.2, D-037)

```text
/app/settings/privacy ── POST /api/account/export (Origin check, 5/h) ──▶ JSON file, audited
          │
          └─ password + confirm ──▶ accountDeletions{scheduled} ── freeze: sessions deleted,
                                     monitoring off, queued scans cancelled, alerts suppressed
                                              │
             sign in during grace ──▶ /auth/account-deletion ──▶ "Keep my account" (row deleted)
                                              │ purgeAfter (ACCOUNT_DELETION_GRACE_DAYS)
                                              ▼
             worker account-purge: claim (CAS) ─▶ idempotent deletes ─▶ auth rows ─▶ anonymise
             audit ─▶ completion email ─▶ ACCOUNT_DELETED ─▶ row deleted (stale claims resumed)
```
