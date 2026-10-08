# Database Design (MongoDB, database `exovault`)

> Status: **M3 complete (Phase 13).** Every collection below is built; designs that were dropped are noted at the end. Indexes are created explicitly by `npm run db:indexes` (production runs with auto-indexing off; a unit test checks every model is in that script).

## Principles

- **Single-document atomicity, no transactions** (D-004). Invariants are enforced with unique indexes, conditional updates, and idempotent upserts.
- **Embed** what is bounded and read together. **Reference** what is shared or unbounded.
- `timestamps: true`, `strict: true`, schema-level enums from `lib/domain/*`. No unbounded arrays.
- Every user-owned document carries `userId`. Repositories always filter by it.
- No plaintext identifiers, passwords, tokens, or raw provider payloads (spec 2.1, 5.1).

## Collections

| Collection                                                           | Phase | Key fields                                                                                                                                                                                                                                                                                                                                                                | Embedded                                          | References         |
| -------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------ |
| Better Auth `user`, `session`, `account`, `verification` (**built**) | 3     | managed by library; ids are ObjectIds; session has no IP (D-021); codes/tokens hashed (D-019)                                                                                                                                                                                                                                                                             | —                                                 | —                  |
| `identities` (**built**, `models/Identity.ts`)                       | 4     | `userId`, `type`, `valueEncrypted {v, keyId, iv, ciphertext, tag}` (AAD `identity:<_id>`), `valueBlindIndex`, `valueMasked`, `verificationStatus`, `verifiedAt`, `verificationMethod`, `status`, `monitoring {enabled, frequency, nextScanAt}`, `lastScanAt`                                                                                                              | monitoring settings (bounded), encrypted envelope | user               |
| `identityVerifications` (**built**)                                  | 4     | `identityId` (unique), `userId`, `codeHash` (keyed HMAC), `attempts`, `expiresAt` (TTL), `consumedAt`                                                                                                                                                                                                                                                                     | —                                                 | identity           |
| `identityQuotas` (**built**, D-024)                                  | 4     | `userId` (unique), `active`                                                                                                                                                                                                                                                                                                                                               | —                                                 | user               |
| `breaches` (**built**, `models/Breach.ts`)                           | 5     | `catalogKey` (unique, `sourceKey:day`), `sourceKey`, `displayName`, `sourceType`, `breachDate`, `dataTypes[]`, `isSensitive`, `providerRefs[] {provider, reference}` (≤20), `evidenceReferences[]` (≤20), `isDemo`                                                                                                                                                        | provider refs (bounded)                           | —                  |
| `exposures` (**built**, `models/Exposure.ts`)                        | 5     | `userId`, `identityId`, `breachId`, `fingerprint`, `sourceKey`, `sourceName`, `sourceType`, `breachDate`, `exposedDataTypes[]`, `isSensitiveSource`, `confidence`, `providers[]`, `providerReferences[]`, `evidenceReferences[]`, `severity`, `severityReason`, `severityMethodologyVersion`, `detectionState`, `remediationState`, `firstSeenAt`, `lastSeenAt`, `isDemo` | data types, providers (bounded)                   | identity, breach   |
| `scans` (**built**, `models/Scan.ts`)                                | 6     | `userId`, `identityId`, `trigger (manual/retry/scheduled)`, `retryOfScanId`, `state`, `active` (lock flag), `stateHistory[]` (≤12), `providerResults[] {provider, state, errorCategory, attempts, count, startedAt, finishedAt, isDemo}`, `summary {new, changed, existing, noLongerReported, activeBySeverity}`, `failureReason`, `lastProgressAt`                       | provider results, state history                   | identity           |
| `riskScores` (**built**, `models/RiskScore.ts`)                      | 7     | `userId`, `score`, `band`, `factors[] {key, label, points, detail}` (≤20), `methodologyVersion`, `exposureCount`, `reason`, `scanId`, `computedAt`                                                                                                                                                                                                                        | factors (bounded)                                 | user, scan         |
| `remediationActions` (**built**, `models/RemediationAction.ts`)      | 8     | `userId`, `identityId`, `exposureId`, `actionKey` (checklist key), `completedAt`; presence = done                                                                                                                                                                                                                                                                         | —                                                 | exposure, identity |
| `notifications` (**built**, `models/Notification.ts`)                | 10    | `userId`, `identityId`, `exposureId`, `scanId`, `channel`, `kind`, `severity`, `dedupeKey` (unique), `status`, `suppressionReason`, `scheduledFor`, `digest`, `attempts`, `sentAt`, `readAt`; no content stored                                                                                                                                                           | —                                                 | user, exposure     |
| `notificationPreferences` (**built**)                                | 10    | `userId` (unique), `emailEnabled`, `minSeverity`, `mode (immediate/digest)`, `quietHours {enabled, start, end}`, `timezone` (IANA, validated)                                                                                                                                                                                                                             | quiet hours                                       | user               |
| `auditLogs` (**built**, `models/AuditLog.ts`)                        | 3     | `event`, `outcome`, `userId` (nullable), `subjectHash`, `ipHash`, `requestId`, `metadata`, `createdAt`; append-only (D-022)                                                                                                                                                                                                                                               | —                                                 | —                  |
| `pendingSignups` (**built**, D-034)                                  | 11    | `userId` (unique), `nonceHash` (SHA-256 of the browser-bound nonce), `expiresAt` (TTL)                                                                                                                                                                                                                                                                                    | —                                                 | user               |
| `accountDeletions` (**built**, D-037)                                | 13    | `userId` (unique), `state (scheduled/purging)`, `requestedAt`, `purgeAfter`, `claimedAt`, `attempts`, `emailEncrypted` (AES-256-GCM, AAD `account-deletion:<userId>`); deleted when the purge finishes                                                                                                                                                                    | encrypted envelope                                | user               |
| `providerStates` (**built**)                                         | 5     | `provider` (unique), `health`, `consecutiveFailures`, `lastSuccessAt`, `lastFailureAt`, `lastErrorCategory`, `cooldownUntil`                                                                                                                                                                                                                                              | —                                                 | —                  |

## Indexes

Every index has a query that needs it; none are speculative.

| Collection            | Index                                                                 | Reason                                                     |
| --------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------- |
| user                  | `{ email: 1 }` unique                                                 | one account per address, enforced by the DB                |
| session               | `{ token: 1 }` unique                                                 | session lookup                                             |
| session               | `{ userId: 1, updatedAt: -1 }`                                        | Settings → Security session list                           |
| session               | `{ expiresAt: 1 }` TTL 0                                              | expired sessions deleted automatically                     |
| account               | `{ userId: 1 }`                                                       | credential lookup                                          |
| verification          | `{ identifier: 1 }`; `{ expiresAt: 1 }` TTL 0                         | code/token lookup; purge on expiry                         |
| identities            | `{ userId: 1, status: 1, createdAt: -1 }`                             | a user's identities                                        |
| identities            | `{ userId: 1, type: 1, valueBlindIndex: 1 }` unique, partial (active) | no duplicate active identifier per user                    |
| identities            | `{ "monitoring.enabled": 1, "monitoring.nextScanAt": 1 }`             | scheduler sweep (claims due identities)                    |
| identityVerifications | `{ identityId: 1 }` unique; `{ expiresAt: 1 }` TTL 0                  | one live code per identity; expired codes deleted          |
| identityQuotas        | `{ userId: 1 }` unique                                                | atomic active-identity limit (D-024)                       |
| breaches              | `{ catalogKey: 1 }` unique; `{ sourceKey: 1 }`                        | idempotent catalog upsert; matching                        |
| exposures             | `{ identityId: 1, fingerprint: 1 }` unique                            | dedupe via idempotent upsert                               |
| exposures             | `{ identityId: 1, sourceKey: 1 }`                                     | matching candidates for an incoming report                 |
| exposures             | `{ userId: 1, remediationState: 1, severity: 1 }`                     | dashboard counts, active filters                           |
| exposures             | `{ userId: 1, firstSeenAt: -1 }`                                      | recent exposures, timeline                                 |
| scans                 | `{ identityId: 1 }` unique, partial (`active: true`)                  | **one active scan per identity**, enforced by the DB       |
| scans                 | `{ identityId: 1, trigger: 1, createdAt: -1 }`                        | cooldown check, per-identity history                       |
| scans                 | `{ userId: 1, createdAt: -1 }`; `{ createdAt: 1 }` TTL 365 d          | history; 12-month retention                                |
| riskScores            | `{ userId: 1, computedAt: -1 }`; `{ computedAt: 1 }` TTL 365 d        | latest score, history; retention                           |
| remediationActions    | `{ exposureId: 1, actionKey: 1 }` unique; `{ identityId: 1 }`         | idempotent checklist ticks; delete with identity           |
| notifications         | `{ dedupeKey: 1 }` unique                                             | never notify the same event twice                          |
| notifications         | `{ status: 1, scheduledFor: 1 }`; `{ userId: 1, createdAt: -1 }`      | dispatcher; inbox                                          |
| notifications         | `{ createdAt: 1 }` TTL 90 d                                           | retention                                                  |
| notificationPrefs     | `{ userId: 1 }` unique                                                | one settings row per user                                  |
| auditLogs             | `{ userId: 1, createdAt: -1 }`                                        | activity feed, export                                      |
| auditLogs             | `{ subjectHash: 1, createdAt: -1 }` partial                           | correlate failed attempts for one subject                  |
| auditLogs             | `{ createdAt: 1 }` TTL 365 d                                          | 12-month retention                                         |
| pendingSignups        | `{ userId: 1 }` unique; `{ expiresAt: 1 }` TTL 0                      | one binding per account; expired bindings deleted          |
| accountDeletions      | `{ userId: 1 }` unique                                                | one pending deletion per user; per-request "is it frozen?" |
| accountDeletions      | `{ state: 1, purgeAfter: 1 }`                                         | purge job: due and stale rows                              |
| providerStates        | `{ provider: 1 }` unique                                              | one circuit-breaker row per provider                       |

## Designs that were dropped

- `userProfiles`: its fields found better homes. The timezone lives in `notificationPreferences`, deletion state in `accountDeletions`, and MFA status will come from the auth library.
- `monitoringSchedules`: monitoring settings are bounded and always read with their identity, so they are embedded in `identities.monitoring` and swept by the index above.

## Future exposure graph

Stable IDs already exist for each node type: `identityId`, `breachId` (source), and the data-type enum values. A later graph view can be derived from `exposures` without changing the schema.
