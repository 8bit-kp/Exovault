import { describe, expect, it } from "vitest";
import { isActiveExposure } from "@/lib/domain/exposure";

describe("isActiveExposure", () => {
  it("treats newly detected, unhandled exposures as active", () => {
    expect(isActiveExposure({ detectionState: "new", remediationState: "open" })).toBe(true);
  });

  it("keeps exposures the user is still working on active", () => {
    expect(isActiveExposure({ detectionState: "existing", remediationState: "in_progress" })).toBe(true);
    expect(isActiveExposure({ detectionState: "changed", remediationState: "open" })).toBe(true);
  });

  it("closes exposures the user remediated or dismissed, whatever the provider says", () => {
    expect(isActiveExposure({ detectionState: "changed", remediationState: "remediated" })).toBe(false);
    expect(isActiveExposure({ detectionState: "new", remediationState: "dismissed" })).toBe(false);
  });

  it("does not count exposures no provider reports any more", () => {
    expect(isActiveExposure({ detectionState: "no_longer_reported", remediationState: "open" })).toBe(false);
  });
});
