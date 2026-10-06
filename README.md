# Exovault

**A privacy-first exposure intelligence platform for individuals.** Exovault checks whether your _verified_ identifiers appear in legitimate breach and credential-exposure sources, and tells you what to do about it.

> **Status: early development (Phase 4 of 13: identity).** Accounts work end to end, and users can add an email identity, prove they own it, and see it stored encrypted (AES-256-GCM, keyed blind index, masked display). Scanning and exposures are not built yet. Browse the component reference at `/design-system` (fictional data). See [`docs/PROGRESS.md`](docs/PROGRESS.md).

## What it is not

Exovault is not a dark-web crawler, it doesn't claim complete coverage, and it isn't a guarantee of safety. It reports only what its configured providers know. "No results" means "not found in the sources we checked".

## Running locally

Prerequisites: Node ≥ 22, MongoDB Community Server running on `127.0.0.1:27017`, and either Docker or a native Redis.

```bash
npm install
npm run env:init          # creates .env.local with freshly generated secrets
docker compose up -d      # Redis (noeviction) + Mailpit (http://localhost:8025)
#   …or natively: brew install redis mailpit && mailpit
npm run db:indexes        # create MongoDB indexes explicitly
# npm run keys:rotate     # after changing IDENTIFIER_ENCRYPTION_ACTIVE_KEY_ID
npm run dev
```

On Windows, run Redis through Docker or WSL. Redis doesn't officially support native Windows.

## Quality checks

```bash
npm run lint && npm run format:check && npm run typecheck && npm run build
npm run test:unit         # unit + component (jsdom, axe)
npm run test:integration  # in-memory MongoDB + local Redis (DB 15)
npm run test:e2e          # Playwright vs a production build; starts Mailpit; uses the exovault_e2e DB
```

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Database](docs/DATABASE.md) · [Threat model](docs/THREAT-MODEL.md) · [Design system](docs/DESIGN-SYSTEM.md) · [Security](docs/SECURITY.md) · [Privacy data model](docs/PRIVACY-DATA-MODEL.md) · [Decisions](docs/DECISIONS.md) · [Progress](docs/PROGRESS.md) · [Build spec](docs/MASTER-PROMPT.md)
