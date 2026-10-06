import type { ProviderExposure } from "../interface";

/**
 * Fictional breach catalog for demo mode and tests. Every name is invented
 * and suffixed "(fictional)"; nothing here describes a real incident.
 */
export const MOCK_BREACHES: Record<string, ProviderExposure> = {
  northwind: {
    providerReference: "NorthwindRewards",
    sourceName: "Northwind Rewards (fictional)",
    sourceType: "breach",
    breachDate: new Date("2026-07-14T00:00:00Z"),
    addedToProviderAt: new Date("2026-09-20T00:00:00Z"),
    exposedDataTypes: ["email", "ip_address", "name", "password_plaintext", "phone"],
    isSensitiveSource: false,
    confidence: 0.95,
  },
  contoso: {
    providerReference: "ContosoForums",
    sourceName: "Contoso Forums (fictional)",
    sourceType: "breach",
    breachDate: new Date("2025-11-02T00:00:00Z"),
    addedToProviderAt: new Date("2026-01-10T00:00:00Z"),
    exposedDataTypes: ["email", "password_hash", "username"],
    isSensitiveSource: false,
    confidence: 0.95,
  },
  lunaDating: {
    providerReference: "LunaDating",
    sourceName: "Luna Dating (fictional)",
    sourceType: "breach",
    breachDate: new Date("2024-03-09T00:00:00Z"),
    addedToProviderAt: new Date("2024-06-01T00:00:00Z"),
    exposedDataTypes: ["date_of_birth", "email", "profile"],
    isSensitiveSource: true,
    confidence: 0.9,
  },
  fabrikam: {
    providerReference: "FabrikamNewsletter",
    sourceName: "Fabrikam Newsletter (fictional)",
    sourceType: "breach",
    breachDate: new Date("2019-03-20T00:00:00Z"),
    addedToProviderAt: new Date("2019-08-01T00:00:00Z"),
    exposedDataTypes: ["email", "name"],
    isSensitiveSource: false,
    confidence: 0.95,
  },
  tailspinLogs: {
    providerReference: "TailspinStealerLogs",
    sourceName: "Tailspin Stealer Logs (fictional)",
    sourceType: "stealer_log",
    breachDate: new Date("2026-05-30T00:00:00Z"),
    addedToProviderAt: new Date("2026-08-02T00:00:00Z"),
    exposedDataTypes: ["email", "password_plaintext"],
    isSensitiveSource: false,
    confidence: 0.8,
  },
};

/** The same incident as `contoso`, as a second provider would report it: other name spelling, extra data. */
export const MOCK_CONTOSO_FROM_SECOND_PROVIDER: ProviderExposure = {
  providerReference: "contoso-2025",
  sourceName: "Contoso Forums (fictional) Inc.",
  sourceType: "breach",
  breachDate: new Date("2025-11-05T00:00:00Z"),
  exposedDataTypes: ["email", "ip_address", "password_hash"],
  isSensitiveSource: false,
  confidence: 0.7,
};
