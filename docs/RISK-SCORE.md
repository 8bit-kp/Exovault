# Exposure Risk Score

> Status: **built (Phase 7).** `server/services/risk/risk-score.ts` (pure), snapshots in `riskScores`. Methodology version **`risk-2026-10.1`**.

**What it is:** a number from **0 to 100** that summarises the risk from a user's _known_ exposures. **Higher means more risk.** It's calculated by Exovault, it is **not** an industry-standard security score, and it can't reflect breaches nobody has reported. The UI always shows the number with its direction, its band, this disclaimer, and a "Why this score?" breakdown.

| Band     | Range  |
| -------- | ------ |
| Minimal  | 0–19   |
| Low      | 20–39  |
| Moderate | 40–59  |
| High     | 60–79  |
| Critical | 80–100 |

## Formula

For every exposure _i_ (all identities of the user):

```
w_i = SeverityWeight(severity) × Recency(incident date, else first seen) × Remediation(state) × Detection(state)
```

| Constant       | Values                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| SeverityWeight | critical 50 · high 25 · medium 12 · low 5 · info 1 (severity from our classifier, spec 7.6)                   |
| Recency        | ≤ 1 year 1.0 · ≤ 3 years 0.8 · ≤ 7 years 0.6 · older 0.4                                                      |
| Remediation    | open 1.0 · in progress 0.7 · dismissed 0.5 · remediated **0.25** (residual risk: the data is still out there) |
| Detection      | still reported 1.0 · no longer reported 0.5                                                                   |

Sort the weights in descending order and apply **diminishing returns**: `raw = Σ w_(k) × 0.7^k`, where _k_ is 0 for the largest. Then add the compounding factors, once each, counting only exposures that are open or in progress and still reported:

| Factor                       | Raw points | When                                                        |
| ---------------------------- | ---------- | ----------------------------------------------------------- |
| Usable credentials exposed   | +8         | a readable password, an auth token, or a stealer-log source |
| Passwords exposed repeatedly | +6         | passwords appear in 3 or more exposures                     |
| Phone number exposed         | +3         | SIM-swap / SMS-phishing risk                                |

If the user has said MFA is on: `raw × 0.85`. If MFA is unknown (today, always), it changes nothing and is shown as information.

```
score = round( 100 × (1 − e^(−raw / 45)) ),  clamped to 0–100
```

The saturating curve keeps a single recent critical exposure in **High** and needs several serious open exposures to reach **Critical**. It can never pass 100.

### "Why this score?"

`factors[]` lists each severity group's share, each compounding factor, the **remediation credit** (score now minus the score if everything were still open, so it's negative), and the MFA status. Positive points are the raw contributions scaled to the final score, so they add up to the score (±1 per factor from rounding; tested).

## Worked examples (asserted in `tests/unit/risk-score.test.ts`)

All examples use an incident ~30 days ago and `now = 2026-10-07`.

| Input                                 | Raw             | Score  | Band     |
| ------------------------------------- | --------------- | ------ | -------- |
| none                                  | 0               | **0**  | Minimal  |
| 1 open low (email only)               | 5               | **11** | Minimal  |
| 1 open medium (email + phone)         | 12+3            | **28** | Low      |
| 1 open high (password hash)           | 25              | **43** | Moderate |
| 1 open critical (readable password)   | 50+8            | **72** | High     |
| 2 open criticals (readable passwords) | 50+35+8         | **87** | Critical |
| 1 critical from 2014, remediated      | 50×0.4×0.25 = 5 | **11** | Minimal  |

## Guarantees (tests)

- **Bounds:** 0 for no exposures; never above 100 (200 criticals); always an integer in 0–100.
- **Monotonic:** adding an open exposure never lowers the score. This is checked on 500 seeded random cases, and it follows from sorted geometric decay with only additive bonuses.
- **Deterministic and order-independent.**
- **Diminishing returns:** each extra identical exposure adds less than the one before.
- **Remediation:** in progress < open; remediated < in progress; remediated > 0; dismissed > remediated.
- **Recency** steps as in the table. Incident date unknown → first seen. No longer reported → lower.
- **MFA** reported on → lower. Unknown = undefined = no effect.

## Snapshots

Each scan's `scoring` step stores a `riskScores` row: score, band, factors, methodology version, exposure count, reason (`scan | remediation | identity_removed`) and scan ID. Removing an identity recomputes the score. The dashboard compares the latest snapshot with the one before it ("Up/Down N since last scan"). Rows expire after 12 months. When any constant changes, the methodology version changes, so old snapshots stay interpretable.

## Limitations

- **Coverage:** only as complete as the providers checked. Unknown breaches score nothing.
- **Severity, not misuse:** it reflects how serious the exposed data is, not whether an attacker has used it.
- **No password reuse:** reuse isn't measured, because we never see passwords (spec Part 11 is a later phase).
- **MFA:** MFA status isn't collected yet.
- **The constants are judgement calls:** they're explicit and versioned so they can be challenged and tuned.
