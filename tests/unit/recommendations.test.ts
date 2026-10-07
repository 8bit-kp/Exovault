import { describe, expect, it } from "vitest";
import type { ExposureView } from "@/components/exposure/types";
import { getRecommendedActions, MAX_RECOMMENDATIONS } from "@/server/services/remediation/recommendations";

const exposure = (overrides: Partial<ExposureView> = {}): ExposureView => ({
  id: "e1",
  sourceName: "Contoso Forums (fictional)",
  sourceType: "breach",
  severity: "high",
  breachDate: null,
  discoveredAt: "2026-10-01T00:00:00Z",
  dataTypes: ["email", "password_hash"],
  detectionState: "new",
  remediationState: "open",
  sensitive: false,
  identityMasked: "a****x@example.com",
  isDemo: true,
  providers: ["demo"],
  ...overrides,
});

const scanned = { hasIdentity: true, hasVerifiedIdentity: true, hasScanned: true };

describe("getRecommendedActions", () => {
  it("guides the first-run journey one step at a time", () => {
    expect(
      getRecommendedActions({
        hasIdentity: false,
        hasVerifiedIdentity: false,
        hasScanned: false,
        exposures: [],
      })[0].key,
    ).toBe("add-identity");
    expect(
      getRecommendedActions({
        hasIdentity: true,
        hasVerifiedIdentity: false,
        hasScanned: false,
        exposures: [],
      })[0].key,
    ).toBe("verify-identity");
    expect(
      getRecommendedActions({
        hasIdentity: true,
        hasVerifiedIdentity: true,
        hasScanned: false,
        exposures: [],
      })[0].key,
    ).toBe("first-scan");
  });

  it("recommends nothing when there's nothing open", () => {
    expect(getRecommendedActions({ ...scanned, exposures: [] })).toEqual([]);
    expect(
      getRecommendedActions({ ...scanned, exposures: [exposure({ remediationState: "remediated" })] }),
    ).toEqual([]);
    expect(
      getRecommendedActions({ ...scanned, exposures: [exposure({ detectionState: "no_longer_reported" })] }),
    ).toEqual([]);
  });

  it("asks for a password change, reuse check and 2FA after a password exposure", () => {
    const keys = getRecommendedActions({ ...scanned, exposures: [exposure()] }).map((a) => a.key);
    expect(keys).toEqual(["change-password:e1", "reused-passwords", "enable-mfa"]);
  });

  it("puts the most severe concern first", () => {
    const actions = getRecommendedActions({
      ...scanned,
      exposures: [
        exposure({ id: "p", severity: "medium", dataTypes: ["phone"] }),
        exposure({ id: "f", severity: "critical", dataTypes: ["financial"] }),
      ],
    });
    expect(actions[0].key).toBe("watch-statements");
    expect(actions.at(-1)?.key).toBe("phone");
  });

  it("never names a sensitive source", () => {
    const actions = getRecommendedActions({
      ...scanned,
      exposures: [exposure({ sensitive: true, sourceName: "Luna Dating (fictional)" })],
    });
    expect(JSON.stringify(actions)).not.toContain("Luna");
    expect(actions[0].title).toContain("a sensitive source");
  });

  it("handles malware logs specifically", () => {
    const actions = getRecommendedActions({
      ...scanned,
      exposures: [exposure({ sourceType: "stealer_log", severity: "critical", dataTypes: ["email"] })],
    });
    expect(actions[0].title).toMatch(/infected device/);
  });

  it("is bounded and de-duplicated", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      exposure({
        id: `e${i}`,
        dataTypes: ["password_plaintext", "phone", "financial", "security_qa", "government_id"],
      }),
    );
    const actions = getRecommendedActions({ ...scanned, exposures: many });
    expect(actions.length).toBe(MAX_RECOMMENDATIONS);
    expect(new Set(actions.map((a) => a.key)).size).toBe(actions.length);
  });
});
