# Privacy data model

> Status: **Phase 4.** Covers account data and monitored identifiers. Exposures (Phase 5), retention jobs, export and deletion are added as they're built. This is documentation for a portfolio project, not legal advice.

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

## What we don't store

Plaintext passwords; plaintext monitored identifiers; raw IP addresses; verification codes or reset tokens in clear; email addresses in URLs, Redis keys, audit rows or logs.

## Third parties that receive data today

| Processor                                | What is sent                                                 | When                                                        |
| ---------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- |
| Pwned Passwords (api.pwnedpasswords.com) | first 5 hex characters of the password's SHA-1 (k-anonymity) | sign-up and password reset, when `PASSWORD_BREACH_CHECK=on` |
| Email provider (SMTP)                    | recipient address, message                                   | verification, reset, account notices                        |

## Lawful basis (GDPR / India DPDP Act 2023)

Account data is processed to provide the service the user signs up for (GDPR Art. 6(1)(b); DPDP Act: consent given at sign-up for the stated purpose). Security logging relies on legitimate interest / reasonable purposes for security. Export and deletion workflows are scheduled for a later phase and will be documented here when they exist.
