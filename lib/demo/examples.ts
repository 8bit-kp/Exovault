import type { ExposureView } from "@/components/exposure/types";

/**
 * Illustrative, fictional data for the landing page and the component gallery.
 * Every surface that renders it must carry a visible "Example" / "Demo data"
 * label (spec 4.3). Sources are invented names on reserved domains.
 */
export const EXAMPLE_EXPOSURES: ExposureView[] = [
  {
    id: "ex-1",
    sourceName: "Northwind Rewards (fictional)",
    sourceType: "breach",
    severity: "critical",
    breachDate: "2026-07-14T00:00:00.000Z",
    discoveredAt: "2026-09-29T08:12:00.000Z",
    dataTypes: ["email", "password_plaintext", "name", "phone", "ip_address"],
    detectionState: "new",
    remediationState: "open",
    sensitive: false,
    identityMasked: "a****x@example.com",
  },
  {
    id: "ex-2",
    sourceName: "Contoso Forums (fictional)",
    sourceType: "breach",
    severity: "high",
    breachDate: "2025-11-02T00:00:00.000Z",
    discoveredAt: "2026-08-03T16:40:00.000Z",
    dataTypes: ["email", "username", "password_hash"],
    detectionState: "existing",
    remediationState: "in_progress",
    sensitive: false,
    identityMasked: "a****x@example.com",
  },
  {
    id: "ex-3",
    sourceName: "Hidden until revealed",
    sourceType: "breach",
    severity: "medium",
    breachDate: null,
    discoveredAt: "2026-08-01T10:05:00.000Z",
    dataTypes: ["email", "date_of_birth", "profile"],
    detectionState: "existing",
    remediationState: "open",
    sensitive: true,
    identityMasked: "a****x@example.com",
  },
  {
    id: "ex-4",
    sourceName: "Fabrikam Newsletter (fictional)",
    sourceType: "breach",
    severity: "low",
    breachDate: "2019-03-20T00:00:00.000Z",
    discoveredAt: "2026-06-18T09:00:00.000Z",
    dataTypes: ["email", "name"],
    detectionState: "existing",
    remediationState: "remediated",
    sensitive: false,
    identityMasked: "a****x@example.com",
  },
];
