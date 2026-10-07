# User flows

> Status: **end of M2 (Phase 10).** The flows that exist today, with the routes they use. Every step has one primary action (spec 13.1).

## 1. First run (spec 13.2)

```text
/ (landing) ── "Check your exposure" ──▶ /auth/sign-up
  ──▶ /auth/verify-email        6-digit code from email (address carried in a sealed cookie, never the URL)
  ──▶ /onboarding               what happens next
  ──▶ /onboarding/identity      "Use my sign-in email" (auto-verified) or another address (+ emailed code)
  ──▶ /onboarding/scan          "Start first scan" → live progress (SSE, real persisted steps)
  ──▶ /onboarding/results       sources checked + date; exposures by severity, or "No known exposures detected"
  ──▶ /app/dashboard
```

## 2. Returning user

`/auth/sign-in` → `/app/dashboard`. The dashboard shows:

- the risk score, with direction, band and "Why this score?"
- active exposures by severity
- monitoring (Off, manual scans only)
- up to 5 recommended actions
- the latest scan, with Scan again or the remaining cooldown
- recent exposures
- recent activity

## 3. Fixing an exposure (spec 13.6)

Exposure card (dashboard, `/app/exposures`, scan results) → `/app/exposures/[id]`:

1. **Headline:** severity, status, and why it got that severity.
2. **What to do:** a checklist built from what was exposed. Each tick is saved; some ticked = In progress, all ticked = Remediated. "Mark as fixed", "Dismiss because…" (reason required), "Reopen".
3. **Why it matters:** plain-language consequences.
4. **What happened:** source type, dates, address (masked), sources, confidence.
5. **What was exposed:** exposed categories, plus "Not detected" with its caveat.
6. **Technical details:** detection state, severity rule, evidence link. Attribution where the licence requires it.

Every change stores a new score snapshot, so the dashboard shows "Down N since last scan".

Sensitive sources show as "Sensitive source (hidden)" in lists, emails and titles. The name appears only after "Reveal source name", which is audited.

## 4. Scanning again

From the dashboard or `/app/identities/[id]`: **Scan again** → `/app/scans/[id]` (live progress, then results).

- **Cooldown:** 15 minutes per identity; failed scans don't count.
- **Partial result:** "N of M sources responded. Results may be incomplete." → **Retry failed source** reruns only the failed sources (3 per hour).

## 5. Monitoring and alerts

1. `/app/monitoring`: turn monitoring on (every 6h, 12h or daily) or off. Off cancels scheduled scans that haven't started.
2. The worker runs scheduled scans. New exposures, and known ones that got more serious, create alerts.
3. Alerts are emailed to the sign-in address, either immediately or in a daily 08:00 summary, held during quiet hours, and filtered by minimum severity (`/app/settings/notifications`).
4. `/app/notifications` lists every alert and what happened to it: emailed, scheduled, or not emailed and why.
5. Each email has "Stop alert emails": a confirmation page, plus RFC 8058 one-click for mail apps.

## 6. Account and identities

- `/app/identities`: add an identity (limit 1 by default).
- `/app/identities/[id]`: reveal the full address (audited, auto-hides after 30 s), verify, resend the code, remove (with confirmation; deletes its exposures and progress).
- `/app/timeline`: every exposure grouped by month, with filters (severity, status, source, identity, months).
- `/app/settings/security`: list sessions (browser only, no IP), sign out one session or all others.
- `/auth/forgot-password` → emailed link → `/auth/reset-password`, which signs you out everywhere.

## States covered on every screen (spec 13.8)

Loading; empty; error with retry; unauthorized (redirect to sign-in with a safe `returnTo`); forbidden or not-found (the same page, D-025); partial failure; no exposures (never "you're safe"); never scanned; verification pending; everything remediated; demo data labelled.
