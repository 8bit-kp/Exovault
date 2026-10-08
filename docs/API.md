# API

> Status: **M3 complete (Phase 13).** Describes what exists. Pattern (spec 12.2): request ID → authenticate → authorize (ownership in the query) → rate-limit → validate → service → typed response. Others' resources are **not found**, never forbidden.

## Route Handlers

| Method & path               | Auth    | Response                                                                                                       | Notes                                                                                     |
| --------------------------- | ------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `GET /api/scans/:id`        | session | `200` `ScanView` JSON · `401` · `404` (missing _or_ someone else's)                                            | polling fallback; `cache-control: no-store`                                               |
| `GET /api/scans/:id/events` | session | `200` `text/event-stream`: `event: scan` with a `ScanView` on each persisted change; `: keep-alive` every 15 s | server reads the DB once a second; closes at a terminal state, at 5 min, or on disconnect |

`ScanView`: `id`, `identityId`, `trigger`, `state`, `failureReason`, `providers[] {name, displayName, state, errorCategory, count, isDemo}`, `summary {new, changed, existing, noLongerReported, activeBySeverity}`, `isDemo`, `createdAt`, `finishedAt`, `retryOfScanId`. It contains no identifier (E2E-checked).

| Method & path                                | Auth                                                              | Response                                                                                | Notes                                                                                                                                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/notifications/unsubscribe?token=` | sealed token (no session)                                         | `200` · `400 invalid_token`                                                             | RFC 8058 one-click target of `List-Unsubscribe`; can only turn alert email off; no Origin check because there is no session to ride on (D-033)                                          |
| `POST /api/account/export`                   | session **and** same-origin (`Origin`/`Sec-Fetch-Site`/`Referer`) | `200` JSON attachment `exovault-export-YYYY-MM-DD.json` · `401` · `403` · `429` · `503` | spec 5.2 data export (D-037); 5 per hour per user; audited `DATA_EXPORTED`; `cache-control: no-store`. Format `exovault-export/1`: see `server/services/account/data-export-service.ts` |
| `GET /.well-known/security.txt`              | none                                                              | `200` text                                                                              | RFC 9116 contact                                                                                                                                                                        |

There is deliberately **no** `/api/auth/*` surface (D-018). Other state changes go through Server Actions, which Next.js protects with an Origin/Host check. The export is the one cookie-authenticated mutating Route Handler (it's a file download and writes an audit event), and it calls `isSameOriginRequest` (`lib/security/origin.ts`) before anything else; any future one must too. Every `/api/*` response also carries `Content-Security-Policy: default-src 'none'`.

## Server Actions (call `requireSession()` first unless noted)

| Action                                                                                                                                  | Input                                              | Service                                           | Limits                                             |
| --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| `signUpAction`, `signInAction`, `verifyEmailAction`, `resendCodeAction`, `forgotPasswordAction`, `resetPasswordAction`, `signOutAction` | form fields (Zod)                                  | `server/services/account/auth-service.ts`         | see SECURITY.md (no session needed for these)      |
| `revokeSessionAction`, `revokeOtherSessionsAction`                                                                                      | `sessionId`                                        | `session-service.ts` (scoped by user)             | —                                                  |
| `addIdentityAction`, `verifyIdentityAction`, `resendIdentityCodeAction`, `revealIdentityAction`, `removeIdentityAction`                 | `email` / `identityId` / `code`                    | `identity-service.ts` (scoped by user)            | 5 adds/day, 10 code guesses/15 min, 3 resends/h    |
| `startScanAction`                                                                                                                       | `identityId`, `flow`                               | `scan-service.startManualScan`                    | 1 manual scan / 15 min / identity; one active scan |
| `retryScanAction`                                                                                                                       | `scanId`, `flow`                                   | `scan-service.retryFailedSources`                 | 3 / hour / identity                                |
| `setChecklistItemAction`, `setRemediationStateAction`, `revealSourceAction`                                                             | `exposureId` + checklist `key`, or `to` + `reason` | `remediation-service.ts` (scoped by user)         | reveals 30 / hour                                  |
| `setMonitoringAction`                                                                                                                   | `identityId`, `enabled`, `frequency`               | `monitoring-service.ts`                           | —                                                  |
| `savePreferencesAction`, `markAllReadAction`                                                                                            | preferences form (Zod)                             | `notification-service.ts`                         | —                                                  |
| `requestDeletionAction`                                                                                                                 | `password`, `confirm`                              | `account-deletion-service.requestAccountDeletion` | password re-entry 5 / 15 min                       |

Two actions don't use `requireSession()`, by design:

- `cancelDeletionAction` (`/auth/account-deletion`) checks the session itself, because `requireSession()` redirects accounts with a pending deletion to that very page.
- `unsubscribeAction` is authorised by a sealed token alone.

Results map to fixed, safe messages (`FormState`); no stack traces or provider details reach the client.

## Pages with query parameters

`/app/timeline?severity=&status=&source=&identity=&from=YYYY-MM&to=YYYY-MM&page=`: every value is validated against a fixed enum or pattern. Invalid values are dropped, never passed to a query.
