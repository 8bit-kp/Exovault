# Exposure engine

> Status: **Phase 5, built.** `server/services/exposure/*`, `lib/domain/severity.ts`, `lib/domain/identifier.ts`. Scan lifecycle, progress and locks are Phase 6.

```text
identity (verified) ─decrypt in memory─▶ normalized email
  ─▶ providers in parallel  [circuit breaker · shared rate budget · timeout · bounded retry]
  ─▶ ProviderExposure ─▶ NormalizedExposure (+provider, sourceKey, OUR severity, discoveredAt)
  ─▶ dedupe within the scan ─▶ match against stored exposures ─▶ idempotent upsert ─▶ diff
```

Entry point: `checkIdentityExposures({ userId, identityId })`. It returns `completed | partial | failed`, the per-provider results (`ok | error(category) | skipped`, attempts, timings), and the diff. A `failed` check writes nothing.

## Identifier normalization (spec 7.4): `normalizeEmail`

Each rule is unit-tested:

1. Trim surrounding whitespace.
2. Apply Unicode **NFC**, not NFKC, so distinct compatibility characters aren't folded together.
3. Split on the last `@`; both parts must be present.
4. Lower-case the domain and convert it to ASCII (IDNA/punycode).
5. Lower-case the local part. This is the standard practical choice: RFC 5321 allows case-sensitive local parts, but no major provider uses them.
6. **Never** strip dots or `+tags`, because they can be distinct mailboxes.
7. Reject malformed input (returns `null`) rather than "fixing" it.

## Source key and matching (spec 7.5, D-026)

- **`normalizeSourceKey`:**
  - Applies NFKD and strips diacritics, then lower-cases.
  - Drops a leading `www.`, a trailing TLD, one trailing legal form (Inc, Ltd, GmbH…), and a leading "The".
  - Removes punctuation and spaces.
  - Examples: "Adobe", "Adobe Inc." and "adobe.com" all become `adobe`. "Adobe Creative Cloud" stays distinct.
- **Same incident:** same source key, and incident dates within **31 days**, or either date unknown.
- **Fingerprint:** `sha256(["exposure-fp-v1", identityId, sourceKey, incidentDay | "unknown"])`. It's the stable ID behind the unique `(identityId, fingerprint)` index.
  - Data categories are excluded, so new categories mean the same exposure in state **CHANGED**.
  - Provider references are excluded, so two providers' reports of one breach merge.
- **Merge:**
  - Keeps the union of providers, references, data categories and evidence links.
  - Keeps the highest confidence and the earliest known incident date.
  - Takes the source name from the most confident report.
  - Sensitive if any report says so; stealer-log if any report says so.
  - Severity is recomputed from the merged categories.
- **Determinism:** dedupe output doesn't depend on input order (tested).

## Confidence (0–1)

How sure we are that the record really involves this identity and that its data categories are accurate:

| Source           | Confidence       |
| ---------------- | ---------------- |
| HIBP, verified   | 0.95             |
| HIBP, unverified | 0.60             |
| HIBP spam list   | 0.50             |
| Demo catalog     | 0.70–0.95        |
| Merged report    | max of its parts |

## Severity (spec 7.6): `classifySeverity`, methodology `2026-10.2`

`2026-10.2` (Phase 12) changed only the wording of the stored reason: it names the data in plain language ("a scrambled copy of your password") instead of internal keys (`password_hash`). The severity matrix is unchanged.

| Severity | Rule (first match wins, most severe first)                                                 |
| -------- | ------------------------------------------------------------------------------------------ |
| Critical | stealer-log source; or plaintext password, auth token, security Q&A, financial data        |
| High     | home address **and** phone together; or password hash, government ID, 2FA backup codes     |
| Medium   | username **and** email together; or phone, date of birth, IP address, home address (alone) |
| Low      | anything else with at least one category (email only, name, profile…)                      |
| Info     | source known, no categories                                                                |

- Provider opinions about severity are never used.
- Adding a category never lowers severity; a test checks every pair of categories.
- The display-only age modifier (`displayPriority`) sorts exposures older than 7 years one level lower, never below Low. It doesn't change the stored severity.
- "Home address alone → Medium" is our addition to the spec's matrix (D-027).

## Detection states (spec 7.7)

| State                | Set when                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `new`                | inserted by this scan (upsert created it)                                                                                           |
| `changed`            | matched, and the merged data categories grew                                                                                        |
| `existing`           | matched, nothing new                                                                                                                |
| `no_longer_reported` | **every** provider that ever reported it answered successfully in this scan and none returned it. A failed provider proves nothing. |

Remediation state is never touched by scans.

## Persistence

- Single-document writes only (D-004). Concurrent identical scans create no duplicates (tested), because both race to the same unique `(identityId, fingerprint)` key.
- The `breaches` catalog has one row per `sourceKey:incidentDay`. It's shared across users and holds no personal data.
- Exposures store the identity ID only, never the identifier. Tests dump `exposures`, `breaches` and `providerStates` and check that the address appears in none of them.
