# Privacy data model

> Status: **M3 complete (Phase 13).** Covers every collection the app writes, retention, export and account deletion. The public summary is the `/privacy` page. This is documentation for a portfolio project, not legal advice.

## What we store about an account

| Data                 | Where              | Form                                                              | Why                                      | Retention                        |
| -------------------- | ------------------ | ----------------------------------------------------------------- | ---------------------------------------- | -------------------------------- |
| Sign-in email        | `user.email`       | plaintext (needed to send account email and to sign in)           | authentication, account email            | life of the account              |
| Display name         | `user.name`        | empty: we don't ask for one                                       | —                                        | —                                |
| Password             | `account.password` | scrypt hash only                                                  | authentication                           | life of the account              |
| Session              | `session`          | random token, expiry, browser user-agent; **no IP**               | keep you signed in, list/revoke sessions | 7 days, then TTL-deleted         |
| Verification code    | `verification`     | hashed, 10 min                                                    | prove you own the address                | TTL-deleted at expiry            |
| Password-reset token | `verification`     | SHA-256 hash, 30 min                                              | reset                                    | TTL-deleted at expiry, or on use |
| Audit events         | `auditLogs`        | user ID, event, outcome, request ID, **keyed hashes** of email/IP | security investigation, abuse            | 12 months (TTL)                  |
| Rate-limit counters  | Redis              | keyed hash of IP/email + count                                    | abuse prevention                         | the window (15 min to 1 day)     |

## Monitored identifiers

| Data                         | Where                        | Form                                                    | Retention                                 |
| ---------------------------- | ---------------------------- | ------------------------------------------------------- | ----------------------------------------- |
| The address you want checked | `identities.valueEncrypted`  | AES-256-GCM ciphertext; key held outside the database   | until you remove it (deleted immediately) |
| Duplicate-check index        | `identities.valueBlindIndex` | keyed HMAC (not reversible without the server's pepper) | same                                      |
| Display form                 | `identities.valueMasked`     | `k****n@example.com`                                    | same                                      |
| Ownership code               | `identityVerifications`      | keyed HMAC, 15 min                                      | deleted on use, or TTL at expiry          |

Removing an identity deletes the encrypted value, the index, the mask and any pending code at once. The full address is decrypted only at the moments listed in D-023, and every reveal is recorded in the audit log, by identity ID only.

## Exposures

| Data                   | Where       | Form                                                                                       | Retention                                    |
| ---------------------- | ----------- | ------------------------------------------------------------------------------------------ | -------------------------------------------- |
| Normalized exposure    | `exposures` | source name, incident date, data **categories** (never the leaked values), severity, state | until the identity or the account is deleted |
| Breach catalog         | `breaches`  | public breach metadata, no personal data                                                   | indefinitely (shared reference)              |
| Raw provider responses | —           | **not persisted**: parsed in memory, mapped, discarded                                     | —                                            |

## Scans, scores, alerts and pending work

| Data                 | Where                     | Form                                                                     | Retention                                         |
| -------------------- | ------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------- |
| Scan records         | `scans`                   | state, per-source outcome and counts; no identifier, no raw response     | 12 months (TTL)                                   |
| Risk score snapshots | `riskScores`              | score, band, factor labels and points                                    | 12 months (TTL)                                   |
| Checklist progress   | `remediationActions`      | which step, when                                                         | until the exposure's identity is removed          |
| Alerts               | `notifications`           | IDs, severity, status, timestamps; email content is never stored         | 90 days (TTL)                                     |
| Alert preferences    | `notificationPreferences` | on/off, minimum severity, mode, quiet hours, timezone                    | life of the account                               |
| Sign-up binding      | `pendingSignups`          | SHA-256 of a browser-bound nonce (D-034)                                 | until verified, or TTL at expiry                  |
| Pending deletion     | `accountDeletions`        | dates, state, the sign-in email **encrypted** (for the completion email) | until the purge finishes (grace period + minutes) |

## What we don't store

Plaintext passwords; plaintext monitored identifiers; raw IP addresses; verification codes or reset tokens in clear; email addresses in URLs, Redis keys, audit rows or logs.

## Export (spec 5.2)

Settings → Privacy → "Download my data" calls `POST /api/account/export` and saves a JSON file (`exovault-export/1`):

- the account (email, created);
- identities, **with the full address decrypted** (it's the owner's data, in the owner's session), verification and monitoring state;
- exposures with checklist progress, sensitive source names included;
- scans (per-source outcome, counts), risk score history, alerts, alert preferences;
- the user's security log (event, outcome, time, metadata).

It never includes ciphertext, blind indexes, fingerprints, code hashes, dedupe keys, or the keyed hashes of email and IP addresses held in audit rows. Each export is audited and limited to 5 an hour. Raw provider responses can't be exported because they are never stored.

## Account deletion (spec 5.2)

1. **Request** (Settings → Privacy): password re-entry plus a confirmation tick.
2. **Freeze, immediately:** every session is deleted, monitoring turned off, queued scheduled scans cancelled, pending alerts suppressed. An email states the purge date.
3. **Grace period** (`ACCOUNT_DELETION_GRACE_DAYS`, default 7): signing in leads only to a page offering "Keep my account" and one last export.
4. **Purge** (worker, hourly): deletes the user's identities, verification codes, quota, exposures, checklist progress, scans, scores, alerts, preferences and sign-up binding, then Better Auth's sessions, credentials, reset tokens and the user row.
5. **Audit trail:** rows are kept for their 12 months but unlinked. `userId` and the keyed hash of the address are set to null, including on failed sign-ins for that address. `ACCOUNT_DELETED` is recorded with no user reference.
6. **Confirmation:** a completion email. Then the last encrypted copy of the address (on the pending-deletion row) is deleted.
7. **Backups:** outside the app. Deployments must roll them off within 35 days (DEPLOYMENT.md).

Not deleted, because they hold nothing personal: the shared breach catalog and provider health rows. Rate-limit counters (keyed hashes) expire with their window. Sign-up codes in `verification` hold no user id and expire within 10 minutes.

## Third parties that receive data today

| Processor                                | What is sent                                                 | When                                                        |
| ---------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| Have I Been Pwned (live mode only)       | the normalized monitored email address, over HTTPS           | each scan of a verified identity                            |
| Pwned Passwords (api.pwnedpasswords.com) | first 5 hex characters of the password's SHA-1 (k-anonymity) | sign-up and password reset, when `PASSWORD_BREACH_CHECK=on` |
| Email provider (SMTP)                    | recipient address, message                                   | verification, reset, account notices                        |

## Lawful basis (GDPR / India DPDP Act 2023)

Account data is processed to provide the service the user signs up for (GDPR Art. 6(1)(b); DPDP Act: consent given at sign-up for the stated purpose). Security logging relies on legitimate interest / reasonable purposes for security. Access and portability requests are met by the export; erasure by account deletion (or by removing a single identity, which is immediate).
