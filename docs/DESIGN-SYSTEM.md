# Design system

> Status: **built (Phase 2).** Live reference: run the app and open `/design-system` (fictional data, labelled "Demo data"). Shell previews are at `/design-system/app-shell` and `/design-system/auth-shell`.

## Principles

1. **Answer "what do I need to know or do next?"** Every page has one primary action; content follows the progressive-disclosure order risk → what happened → what was exposed → why it matters → what to do → technical detail.
2. **Never colour alone.** Severity is encoded four ways: text label, icon shape, a 0–4 "signal pip" glyph, and hue.
3. **Honest states.** A missing score shows `--`, not `0`. Monitoring in M1 reads "Off — Manual scans only". "No known exposures" never becomes "you're safe".
4. **Instrument, not toy.** Dark charcoal surfaces, hairline borders, small radii (≤ 8px), mono for numbers and technical data, one restrained accent. No gradients, glows or glass.

## Tokens (`app/globals.css`)

Raw values are `--ev-*` CSS variables. Tailwind's default palette is removed, so only these semantic utilities exist.

| Group     | Utilities                                                                                      | Use                                            |
| --------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Surfaces  | `bg-bg`, `bg-surface-1..3`, `border-line`, `border-line-strong`                                | page → panel → raised → hover                  |
| Text      | `text-fg`, `text-fg-muted`, `text-fg-subtle`                                                   | body ≥ 7:1, muted/subtle ≥ 4.5:1 (axe-checked) |
| Accent    | `bg-accent`, `text-accent`, `bg-accent-tint`, `outline-focus`                                  | primary action, current step, focus ring       |
| Severity  | `text/bg/border/fill-sev-{critical,high,medium,low,info}`                                      | exposures and risk bands only                  |
| Status    | `ok`, `warn`, `danger`, `neutral`                                                              | outcomes of scans/saves, never severity        |
| Type      | `text-2xs … text-6xl`, `font-sans` (IBM Plex Sans), `font-mono` (IBM Plex Mono), `.eyebrow`    | 15px body; tabular numerals on `time`/`data`   |
| Radius    | `rounded-xs/sm/md/lg` = 2/4/6/8px                                                              |                                                |
| Elevation | `shadow-raised`, `shadow-overlay`                                                              | panels, dialogs                                |
| Motion    | `duration-(--duration-fast/base/slow)`, `ease-(--ease-out)`, `animate-sweep`, `animate-signal` | all removed under `prefers-reduced-motion`     |
| Texture   | `.bg-instrument-grid`, `.bg-hatch`                                                             | hero/auth backdrop; partial/incomplete         |

## Severity encoding

| Severity | Label    | Icon           | Pips | Hue          |
| -------- | -------- | -------------- | ---- | ------------ |
| critical | Critical | octagon-alert  | 4    | red          |
| high     | High     | triangle-alert | 3    | orange       |
| medium   | Medium   | chevrons-up    | 2    | amber        |
| low      | Low      | minus          | 1    | blue         |
| info     | Info     | info           | 0    | neutral grey |

Risk-score bands (`lib/domain/risk.ts`, spec Part 9) borrow the same treatment: Minimal→info, Low→low, Moderate→medium, High→high, Critical→critical.

## Components

| Area          | Component                                                                                            | Notes                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `ui/`         | `Button`, `ButtonLink`, `buttonClasses`                                                              | primary / secondary / ghost / danger; ≥ 36px tall                                |
|               | `Panel`, `PanelHeader`, `PanelBody`                                                                  | the one elevated surface                                                         |
|               | `Field`, `Input`                                                                                     | wires label, hint, error, `aria-describedby`, `aria-invalid`                     |
|               | `Callout`                                                                                            | info/ok/warn/danger with icon and hidden tone label                              |
|               | `Tag`, `DemoDataLabel`, `Logo`, `Skeleton`                                                           | `DemoDataLabel` is mandatory on mock/illustrative data                           |
|               | `EmptyState`, `ErrorState`, `LoadingState`, `AccessState`                                            | spec 13.8; callers supply feature-specific copy                                  |
| `exposure/`   | `SeverityBadge`, `SeverityPips`                                                                      |                                                                                  |
|               | `ExposureCard`, `ExposureList`, `ExposureTimeline`                                                   | compact rows; stretched single link; sensitive sources never named in lists      |
|               | `RemediationChecklist` (client)                                                                      | native checkboxes, optimistic, announces failed saves and rolls back             |
|               | `RecommendationCard`                                                                                 |                                                                                  |
| `dashboard/`  | `SecurityScore`, `RiskBadge`, `SeverityBreakdown`, `SecurityEvent`                                   | score always shows direction + methodology disclaimer                            |
| `monitoring/` | `MonitoringStatus`, `ScanProgress`                                                                   | steps map 1:1 to persisted `ScanState` (`scan-steps.ts`); one polite live region |
| `identity/`   | `IdentityCard`                                                                                       | masked value only; pending state says exactly what to do                         |
| `layout/`     | `SiteHeader`, `SiteFooter`, `AuthShell`, `AppShell`, `AppNav`, `MobileNav`, `PageHeader`, `SkipLink` | `MobileNav` is a native `<dialog>` (D-015)                                       |

Components receive view models (`ExposureView`, `IdentityView`) with ISO date strings and masked identifiers. They never import `server/**` or models.

## Accessibility baseline (WCAG 2.2 AA target)

- Skip link is the first tab stop on every page; every layout has `<main id="main">`.
- One global `:focus-visible` style (2px focus colour, offset).
- Dates render in UTC with an explicit "UTC" suffix until users can set a timezone (M2).
- Live regions: `ScanProgress` (one polite region, one sentence per persisted state change), `RemediationChecklist` (progress count; errors via `role=alert`), `LoadingState`.
- Verified by: axe in jsdom per component (`tests/components`), and axe **with colour contrast** on every public page at desktop and Pixel 7 sizes (`tests/e2e/accessibility.spec.ts`), plus keyboard, drawer focus-restoration, and no-horizontal-scroll checks.

## CSP constraints for component authors

Production CSP has no `'unsafe-inline'` (D-014). Don't use `style={…}` on server-rendered elements; use token classes, or SVG attributes for computed geometry. Don't use dynamic class names (`"bg-" + x`); list full class strings so Tailwind can see them (see `severity-meta.ts`).
