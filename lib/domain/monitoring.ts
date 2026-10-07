/**
 * Monitoring vocabulary. In M1 every identity is "off" (manual scans only);
 * scheduled monitoring arrives in M2 (spec Part 3).
 */
export const MONITORING_STATES = ["off", "active", "paused", "degraded"] as const;
export type MonitoringState = (typeof MONITORING_STATES)[number];

export const PROVIDER_RESULT_STATES = ["ok", "error", "skipped"] as const;
export type ProviderResultState = (typeof PROVIDER_RESULT_STATES)[number];

/** Scheduled-scan frequencies (spec Part 10). Stored on the identity. */
export const MONITORING_FREQUENCIES = ["6h", "12h", "24h"] as const;
export type MonitoringFrequency = (typeof MONITORING_FREQUENCIES)[number];

export const FREQUENCY_MS: Record<MonitoringFrequency, number> = {
  "6h": 6 * 60 * 60_000,
  "12h": 12 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
};

export const FREQUENCY_LABELS: Record<MonitoringFrequency, string> = {
  "6h": "Every 6 hours",
  "12h": "Every 12 hours",
  "24h": "Daily",
};

/** ±10% jitter spreads scans across the window so identities enabled together don't scan together. */
export const SCHEDULE_JITTER = 0.1;

/**
 * Next scheduled scan time (spec Part 10). Pure: `random` is injected so tests
 * are deterministic. Never earlier than `from + 90% of the interval`, never
 * later than `from + 110%`.
 */
export function computeNextScanAt(
  from: Date,
  frequency: MonitoringFrequency,
  random: () => number = Math.random,
): Date {
  const interval = FREQUENCY_MS[frequency];
  const jitter = (random() * 2 - 1) * SCHEDULE_JITTER * interval;
  return new Date(from.getTime() + interval + Math.round(jitter));
}

/**
 * When monitoring is switched on: if the identity was scanned recently,
 * continue from that scan; otherwise schedule the first one within minutes.
 */
export function firstScheduledScanAt(
  now: Date,
  lastScanAt: Date | null,
  frequency: MonitoringFrequency,
  random: () => number = Math.random,
): Date {
  if (lastScanAt) {
    const next = computeNextScanAt(lastScanAt, frequency, random);
    if (next.getTime() > now.getTime()) return next;
  }
  // Within the next 1–5 minutes: soon, but not a burst if many are enabled at once.
  return new Date(now.getTime() + 60_000 + Math.round(random() * 4 * 60_000));
}
