# Exovault

**A privacy-first exposure intelligence platform for individuals.** Exovault checks whether your _verified_ identifiers appear in legitimate breach and credential-exposure sources, and tells you what to do about it.

> **Status: early development (Phase 1 of 13: architecture).** The UI and features are not built yet. See [`docs/PROGRESS.md`](docs/PROGRESS.md).

## What it is not

Exovault is not a dark-web crawler, it doesn't claim complete coverage, and it isn't a guarantee of safety. It reports only what its configured providers know. "No results" means "not found in the sources we checked".

## Running locally

Prerequisites: Node ≥ 22, MongoDB Community Server running on `127.0.0.1:27017`, and either Docker or a native Redis.

```bash
npm install
npm run env:init          # creates .env.local with freshly generated secrets
docker compose up -d      # Redis (noeviction) + Mailpit (http://localhost:8025)
npm run dev
```

On Windows, run Redis through Docker or WSL. Redis doesn't officially support native Windows.

## Quality checks

```bash
npm run lint && npm run format:check && npm run typecheck && npm test && npm run build
```

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Database](docs/DATABASE.md) · [Threat model](docs/THREAT-MODEL.md) · [Decisions](docs/DECISIONS.md) · [Progress](docs/PROGRESS.md) · [Build spec](docs/MASTER-PROMPT.md)
