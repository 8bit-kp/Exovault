import { describe, expect, it } from "vitest";
import { isValidTimeZone } from "@/lib/domain/notifications";
import { listTimeZones } from "@/lib/utils/timezones";

describe("listTimeZones", () => {
  it("offers modern names (Asia/Kolkata, Europe/Kyiv) instead of ICU legacy aliases", () => {
    const zones = listTimeZones();
    expect(zones).toContain("Asia/Kolkata");
    expect(zones).toContain("Europe/Kyiv");
    expect(zones).not.toContain("Asia/Calcutta");
    expect(zones[0]).toBe("UTC");
  });

  it("only offers zones our validation accepts, and keeps the user's current one", () => {
    const zones = listTimeZones("Asia/Calcutta");
    expect(zones).toContain("Asia/Calcutta");
    for (const zone of zones) expect(isValidTimeZone(zone)).toBe(true);
  });
});
