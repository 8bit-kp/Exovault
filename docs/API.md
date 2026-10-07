# API

> Status: **Phase 6.** Describes what exists. Pattern (spec 12.2): request ID → authenticate → authorize (ownership in the query) → rate-limit → validate → service → typed response. Others' resources are **not found**, never forbidden.

## Route Handlers

| Method & path               | Auth    | Response                                                                                                       | Notes                                                                                     |
| --------------------------- | ------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `GET /api/scans/:id`        | session | `200` `ScanView` JSON · `401` · `404` (missing _or_ someone else's)                                            | polling fallback; `cache-control: no-store`                                               |
| `GET /api/scans/:id/events` | session | `200` `text/event-stream`: `event: scan` with a `ScanView` on each persisted change; `: keep-alive` every 15 s | server reads the DB once a second; closes at a terminal state, at 5 min, or on disconnect |

`ScanView`: `id`, `identityId`, `trigger`, `state`, `failureReason`, `providers[] {name, displayName, state, errorCategory, count, isDemo}`, `summary {new, changed, existing, noLongerReported, activeBySeverity}`, `isDemo`, `createdAt`, `finishedAt`, `retryOfScanId`. It contains no identifier (E2E-checked).

There is deliberately **no** `/api/auth/*` surface (D-018). Both routes are GET-only; state changes go through Server Actions, which Next.js protects with an Origin/Host check. Any future mutating Route Handler must call `isSameOriginRequest` (`lib/security/origin.ts`).

## Server Actions (all call `requireSession()` first)

| Action                                                                                                                                  | Input                           | Service                                   | Limits                                             |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------- | -------------------------------------------------- |
| `signUpAction`, `signInAction`, `verifyEmailAction`, `resendCodeAction`, `forgotPasswordAction`, `resetPasswordAction`, `signOutAction` | form fields (Zod)               | `server/services/account/auth-service.ts` | see SECURITY.md (no session needed for these)      |
| `revokeSessionAction`, `revokeOtherSessionsAction`                                                                                      | `sessionId`                     | `session-service.ts` (scoped by user)     | —                                                  |
| `addIdentityAction`, `verifyIdentityAction`, `resendIdentityCodeAction`, `revealIdentityAction`, `removeIdentityAction`                 | `email` / `identityId` / `code` | `identity-service.ts` (scoped by user)    | 5 adds/day, 10 code guesses/15 min, 3 resends/h    |
| `startScanAction`                                                                                                                       | `identityId`, `flow`            | `scan-service.startManualScan`            | 1 manual scan / 15 min / identity; one active scan |
| `retryScanAction`                                                                                                                       | `scanId`, `flow`                | `scan-service.retryFailedSources`         | 3 / hour / identity                                |

Results map to fixed, safe messages (`FormState`); no stack traces or provider details reach the client.
