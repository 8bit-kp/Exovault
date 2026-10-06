/**
 * Monitoring vocabulary. In M1 every identity is "off" (manual scans only);
 * scheduled monitoring arrives in M2 (spec Part 3).
 */
export const MONITORING_STATES = ["off", "active", "paused", "degraded"] as const;
export type MonitoringState = (typeof MONITORING_STATES)[number];

export const PROVIDER_RESULT_STATES = ["ok", "error", "skipped"] as const;
export type ProviderResultState = (typeof PROVIDER_RESULT_STATES)[number];
