import { describe, expect, it } from "vitest";
import { groupExposuresByMonth } from "@/components/exposure/exposure-timeline";
import { isNavItemActive } from "@/components/layout/app-nav";
import { EXAMPLE_EXPOSURES } from "@/lib/demo/examples";

describe("groupExposuresByMonth", () => {
  it("groups newest month first and newest item first within a month", () => {
    const groups = groupExposuresByMonth(EXAMPLE_EXPOSURES);
    expect(groups.map((g) => g.key)).toEqual(["2026-09", "2026-08", "2026-06"]);
    expect(groups[1].items.map((e) => e.id)).toEqual(["ex-2", "ex-3"]);
    expect(groups.flatMap((g) => g.items)).toHaveLength(EXAMPLE_EXPOSURES.length);
  });

  it("does not mutate its input", () => {
    const input = [...EXAMPLE_EXPOSURES].reverse();
    const before = input.map((e) => e.id);
    groupExposuresByMonth(input);
    expect(input.map((e) => e.id)).toEqual(before);
  });

  it("returns no groups for no exposures", () => {
    expect(groupExposuresByMonth([])).toEqual([]);
  });
});

describe("isNavItemActive", () => {
  it("matches the section and its children only", () => {
    expect(isNavItemActive("/app/exposures", "/app/exposures")).toBe(true);
    expect(isNavItemActive("/app/exposures", "/app/exposures/abc123")).toBe(true);
    expect(isNavItemActive("/app/exposures", "/app/exposures-archive")).toBe(false);
    expect(isNavItemActive("/app/dashboard", "/app/exposures")).toBe(false);
  });

  it("keeps Settings active on every settings sub-page", () => {
    expect(isNavItemActive("/app/settings/profile", "/app/settings/security")).toBe(true);
  });
});
