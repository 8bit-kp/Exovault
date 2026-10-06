import { describe, expect, it } from "vitest";
import { deduplicateExposures, isSameIncident, mergeExposures } from "@/server/services/exposure/dedupe";
import { createExposureFingerprint } from "@/server/services/exposure/fingerprint";
import { normalizeSourceKey } from "@/server/services/exposure/source-key";
import type { NormalizedExposure } from "@/server/services/exposure/types";

const base = (overrides: Partial<NormalizedExposure> = {}): NormalizedExposure => ({
  providers: ["p1"],
  providerReferences: [{ provider: "p1", reference: "Adobe" }],
  sourceName: "Adobe",
  sourceKey: "adobe",
  sourceType: "breach",
  breachDate: new Date("2013-10-04T00:00:00Z"),
  addedToProviderAt: null,
  exposedDataTypes: ["email", "password_hash"],
  isSensitiveSource: false,
  confidence: 0.9,
  evidenceReferences: [],
  severity: "high",
  severityReason: "x",
  discoveredAt: new Date("2026-10-06T00:00:00Z"),
  ...overrides,
});

describe("normalizeSourceKey", () => {
  it.each([
    ["Adobe", "adobe"],
    ["Adobe Inc.", "adobe"],
    ["adobe.com", "adobe"],
    ["www.Adobe.com", "adobe"],
    ["ADOBE, INC", "adobe"],
    ["The Ticket Company Ltd", "ticketcompany"],
    ["Café Société GmbH", "cafesociete"],
    ["Bits & Bytes", "bitsandbytes"],
  ])("%s → %s", (input, key) => expect(normalizeSourceKey(input)).toBe(key));

  it("keeps genuinely different sources apart", () => {
    expect(normalizeSourceKey("Adobe")).not.toBe(normalizeSourceKey("Adobe Creative Cloud"));
    expect(normalizeSourceKey("LinkedIn")).not.toBe(normalizeSourceKey("LinkedIn Scraped Data"));
  });

  it("never returns an empty key", () => {
    expect(normalizeSourceKey("   ")).toBe("unknown");
    expect(normalizeSourceKey("Inc.")).toBe("inc");
  });
});

describe("createExposureFingerprint", () => {
  const input = { identityId: "id1", sourceKey: "adobe", breachDate: new Date("2013-10-04T15:00:00Z") };

  it("is deterministic and day-precise", () => {
    expect(createExposureFingerprint(input)).toBe(createExposureFingerprint({ ...input }));
    expect(createExposureFingerprint(input)).toBe(
      createExposureFingerprint({ ...input, breachDate: new Date("2013-10-04T01:00:00Z") }),
    );
    expect(createExposureFingerprint(input)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs per identity, per source and per incident day", () => {
    const fp = createExposureFingerprint(input);
    expect(createExposureFingerprint({ ...input, identityId: "id2" })).not.toBe(fp);
    expect(createExposureFingerprint({ ...input, sourceKey: "linkedin" })).not.toBe(fp);
    expect(createExposureFingerprint({ ...input, breachDate: new Date("2019-01-01") })).not.toBe(fp);
    expect(createExposureFingerprint({ ...input, breachDate: null })).not.toBe(fp);
  });
});

describe("deduplicateExposures", () => {
  it("merges exact duplicates", () => {
    expect(deduplicateExposures([base(), base()])).toHaveLength(1);
  });

  it("merges the same breach reported by two providers, keeping both providers and the union of data", () => {
    const merged = deduplicateExposures([
      base(),
      base({
        providers: ["p2"],
        providerReferences: [{ provider: "p2", reference: "adobe-2013" }],
        sourceName: "Adobe Inc.",
        breachDate: new Date("2013-10-01T00:00:00Z"),
        exposedDataTypes: ["email", "password_plaintext"],
        confidence: 0.7,
      }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].providers).toEqual(["p1", "p2"]);
    expect(merged[0].exposedDataTypes).toEqual(["email", "password_hash", "password_plaintext"]);
    expect(merged[0].sourceName).toBe("Adobe"); // from the more confident report
    expect(merged[0].confidence).toBe(0.9);
    expect(merged[0].breachDate?.toISOString().slice(0, 10)).toBe("2013-10-01"); // earliest known
    expect(merged[0].severity).toBe("critical"); // recomputed from merged data
  });

  it("merges a report with an unknown date into the dated one", () => {
    expect(deduplicateExposures([base(), base({ providers: ["p2"], breachDate: null })])).toHaveLength(1);
  });

  it("keeps separate incidents at the same source apart (dates far apart)", () => {
    const result = deduplicateExposures([base(), base({ breachDate: new Date("2019-05-01") })]);
    expect(result).toHaveLength(2);
  });

  it("keeps different sources apart", () => {
    expect(deduplicateExposures([base(), base({ sourceKey: "adobecreativecloud" })])).toHaveLength(2);
  });

  it("is independent of input order", () => {
    const items = [
      base(),
      base({ providers: ["p2"], confidence: 0.5, exposedDataTypes: ["phone"] }),
      base({ sourceKey: "linkedin", sourceName: "LinkedIn", breachDate: new Date("2012-05-05") }),
    ];
    expect(deduplicateExposures(items)).toEqual(deduplicateExposures([...items].reverse()));
  });

  it("propagates the sensitive flag and the stealer-log source type", () => {
    const merged = mergeExposures(base(), base({ isSensitiveSource: true, sourceType: "stealer_log" }));
    expect(merged.isSensitiveSource).toBe(true);
    expect(merged.sourceType).toBe("stealer_log");
    expect(merged.severity).toBe("critical");
  });

  it("isSameIncident respects the 31-day window", () => {
    expect(isSameIncident(base(), base({ breachDate: new Date("2013-11-03T00:00:00Z") }))).toBe(true);
    expect(isSameIncident(base(), base({ breachDate: new Date("2013-11-06T00:00:00Z") }))).toBe(false);
  });
});
