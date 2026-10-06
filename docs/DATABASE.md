# Database Design (MongoDB, database `exovault`)

> Status: **design only (Phase 1).** No models exist yet. Each collection gets built in the phase listed. This document will be updated to match the code.

## Principles

- **Single-document atomicity, no transactions** (D-004). Invariants are enforced with unique indexes, conditional updates, and idempotent upserts.
- **Embed** what is bounded and read together. **Reference** what is shared or unbounded.
- `timestamps: true`, `strict: true`, schema-level enums from `lib/domain/*`. No unbounded arrays.
- Every user-owned document carries `userId`. Repositories always filter by it.
- No plaintext identifiers, passwords, tokens, or raw provider payloads (spec 2.1, 5.1).

## Collections

| Collection                                               | Phase | Key fields                                                                                                                                                                                                     | Embedded                                  | References       |
| -------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------- |
| Better Auth `user`, `session`, `account`, `verification` | 3     | managed by library                                                                                                                                                                                             | —                                         | —                |
| `userProfiles`                                           | 3     | `userId` (unique), `timezone`, `mfaSelfReported`, `deletionRequestedAt`                                                                                                                                        | —                                         | user             |
| `identities`                                             | 4     | `userId`, `type`, `valueEncrypted`, `keyId`, `valueBlindIndex`, `valueMasked`, `verificationStatus`, `status (active/archived/deleted)`, `monitoring {enabled, frequency, nextScanAt, lastScanAt}`             | monitoring settings (bounded)             | user             |
| `identityVerifications`                                  | 4     | `identityId`, `userId`, `tokenHash`, `expiresAt`, `attempts`, `consumedAt`                                                                                                                                     | —                                         | identity         |
| `breaches`                                               | 5     | `sourceKey` (unique, normalized), `displayName`, `aliases[]` (bounded), `breachDate`, `isSensitive`, `dataTypes[]`, `providerRefs[] {provider, ref}`                                                           | provider refs (bounded by provider count) | —                |
| `exposures`                                              | 5     | `userId`, `identityId`, `breachId`, `fingerprint`, `providers[]`, `severity`, `exposedDataTypes[]`, `confidence`, `detectionState`, `remediationState`, `firstSeenAt`, `lastSeenAt`, `isSensitiveSource`       | data types, providers (bounded enums)     | identity, breach |
| `scans`                                                  | 6     | `userId`, `identityId`, `trigger (manual/scheduled)`, `state`, `stateHistory[]` (≤ 8), `providerResults[] {provider, status, errorCategory, startedAt, finishedAt, count}`, `summary {new, changed, existing}` | provider results, state history           | identity         |
| `riskScores`                                             | 7     | `userId`, `score`, `band`, `factors[]`, `methodologyVersion`, `computedAt`, `scanId?`                                                                                                                          | factors (bounded by factor list)          | user             |
| `remediationActions`                                     | 8     | `userId`, `exposureId`, `actionKey`, `completedAt`                                                                                                                                                             | —                                         | exposure         |
| `monitoringSchedules`                                    | 9     | `identityId`, `userId`, `frequency`, `nextScanAt`, `status`, `lockedUntil`                                                                                                                                     | —                                         | identity         |
| `notifications`                                          | 10    | `userId`, `dedupeKey` (unique), `channel`, `type`, `status`, `sentAt`                                                                                                                                          | —                                         | user, exposure   |
| `notificationPreferences`                                | 10    | `userId` (unique), `channels`, `minSeverity`, `mode (immediate/digest)`, `quietHours`, `timezone`                                                                                                              | —                                         | user             |
| `auditLogs`                                              | 3     | `userId` (nullable after deletion), `event`, `requestId`, `metadata` (IDs only), `createdAt`                                                                                                                   | —                                         | —                |
| `providerStates`                                         | 5     | `provider` (unique), `health`, `lastSuccessAt`, `consecutiveFailures`, `cooldownUntil`                                                                                                                         | —                                         | —                |

## Planned indexes (and why)

| Collection            | Index                                                                              | Reason                                                |
| --------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------- |
| identities            | `{ userId: 1, status: 1 }`                                                         | list a user's identities; active-identity limit check |
| identities            | `{ userId: 1, type: 1, valueBlindIndex: 1 }` unique (partial: `status != deleted`) | a user can't add the same identifier twice            |
| identityVerifications | `{ tokenHash: 1 }` unique; `{ expiresAt: 1 }` TTL                                  | single-use lookup; auto-expiry                        |
| exposures             | `{ identityId: 1, fingerprint: 1 }` unique                                         | dedupe via idempotent upsert                          |
| exposures             | `{ userId: 1, remediationState: 1, severity: 1 }`                                  | dashboard counts / active filters                     |
| exposures             | `{ userId: 1, firstSeenAt: -1 }`                                                   | timeline, recent exposures                            |
| scans                 | `{ identityId: 1, state: 1 }` partial on non-terminal states, unique               | **one active scan per identity** enforced by the DB   |
| scans                 | `{ userId: 1, createdAt: -1 }`; `{ createdAt: 1 }` TTL 365 d                       | history; 12-month retention                           |
| riskScores            | `{ userId: 1, computedAt: -1 }`                                                    | latest score, history                                 |
| monitoringSchedules   | `{ status: 1, nextScanAt: 1 }`                                                     | scheduler sweep                                       |
| notifications         | `{ dedupeKey: 1 }` unique; `{ createdAt: 1 }` TTL 90 d                             | never re-notify; retention                            |
| auditLogs             | `{ userId: 1, createdAt: -1 }`; `{ createdAt: 1 }` TTL 365 d                       | activity feed; retention                              |

## Future exposure graph

Stable IDs already exist for each node type: `identityId`, `breachId` (source), and the data-type enum values. A later graph view can be derived from `exposures` without changing the schema.
