import { describe, expect, it } from "vitest";
import {
  dedupeKey,
  DEFAULT_PREFERENCES,
  inQuietHours,
  isMaterialChange,
  isValidTimeZone,
  nextDeliveryTime,
  nextDigestTime,
  suppressionReason,
} from "@/lib/domain/notifications";

const quiet = (start: string, end: string, timezone = "UTC") => ({
  quietHours: { enabled: true, start, end },
  timezone,
});

describe("dedupe keys", () => {
  const base = { identityId: "i1", fingerprint: "f".repeat(64), channel: "email" as const };
  it("is stable per exposure and channel, so the same exposure is never alerted twice", () => {
    expect(dedupeKey({ ...base, kind: "new_exposure", severity: "high" })).toBe(
      dedupeKey({ ...base, kind: "new_exposure", severity: "critical" }),
    );
  });
  it("lets each escalation alert once", () => {
    const high = dedupeKey({ ...base, kind: "exposure_changed", severity: "high" });
    const critical = dedupeKey({ ...base, kind: "exposure_changed", severity: "critical" });
    expect(high).not.toBe(critical);
    expect(high).not.toBe(dedupeKey({ ...base, kind: "new_exposure", severity: "high" }));
  });
});

describe("material change and suppression", () => {
  it("only a severity increase is material", () => {
    expect(isMaterialChange("medium", "high")).toBe(true);
    expect(isMaterialChange("high", "high")).toBe(false);
    expect(isMaterialChange("critical", "high")).toBe(false);
  });
  it("respects the email switch and the minimum severity", () => {
    expect(suppressionReason("critical", { emailEnabled: false, minSeverity: "low" })).toBe("email_disabled");
    expect(suppressionReason("low", { emailEnabled: true, minSeverity: "medium" })).toBe(
      "below_min_severity",
    );
    expect(suppressionReason("medium", { emailEnabled: true, minSeverity: "medium" })).toBeNull();
    expect(suppressionReason("critical", DEFAULT_PREFERENCES)).toBeNull();
  });
});

describe("quiet hours", () => {
  it("handles windows that cross midnight", () => {
    expect(inQuietHours(new Date("2026-10-07T23:30:00Z"), quiet("22:00", "07:00"))).toBe(true);
    expect(inQuietHours(new Date("2026-10-07T06:59:00Z"), quiet("22:00", "07:00"))).toBe(true);
    expect(inQuietHours(new Date("2026-10-07T07:00:00Z"), quiet("22:00", "07:00"))).toBe(false);
    expect(inQuietHours(new Date("2026-10-07T12:00:00Z"), quiet("22:00", "07:00"))).toBe(false);
  });

  it("handles same-day windows and disabled / empty windows", () => {
    expect(inQuietHours(new Date("2026-10-07T13:00:00Z"), quiet("12:00", "14:00"))).toBe(true);
    expect(
      inQuietHours(new Date("2026-10-07T13:00:00Z"), {
        ...quiet("12:00", "14:00"),
        quietHours: { enabled: false, start: "12:00", end: "14:00" },
      }),
    ).toBe(false);
    expect(inQuietHours(new Date("2026-10-07T13:00:00Z"), quiet("09:00", "09:00"))).toBe(false);
  });

  it("evaluates in the user's timezone", () => {
    // 18:00 UTC is 23:30 in Kolkata (UTC+5:30): inside 22:00–07:00 there, not in UTC.
    const at = new Date("2026-10-07T18:00:00Z");
    expect(inQuietHours(at, quiet("22:00", "07:00", "Asia/Kolkata"))).toBe(true);
    expect(inQuietHours(at, quiet("22:00", "07:00", "UTC"))).toBe(false);
  });

  it("defers delivery to the end of quiet hours, or sends now", () => {
    expect(nextDeliveryTime(new Date("2026-10-07T23:30:00Z"), quiet("22:00", "07:00")).toISOString()).toBe(
      "2026-10-08T07:00:00.000Z",
    );
    const noon = new Date("2026-10-07T12:00:00Z");
    expect(nextDeliveryTime(noon, quiet("22:00", "07:00"))).toBe(noon);
    // Kolkata 23:30 → 07:00 local = 01:30 UTC next day.
    expect(
      nextDeliveryTime(
        new Date("2026-10-07T18:00:00Z"),
        quiet("22:00", "07:00", "Asia/Kolkata"),
      ).toISOString(),
    ).toBe("2026-10-08T01:30:00.000Z");
  });
});

describe("digest timing", () => {
  it("is the next 08:00 local", () => {
    expect(nextDigestTime(new Date("2026-10-07T06:00:00Z"), "UTC").toISOString()).toBe(
      "2026-10-07T08:00:00.000Z",
    );
    expect(nextDigestTime(new Date("2026-10-07T09:00:00Z"), "UTC").toISOString()).toBe(
      "2026-10-08T08:00:00.000Z",
    );
    expect(nextDigestTime(new Date("2026-10-07T08:00:00Z"), "UTC").toISOString()).toBe(
      "2026-10-08T08:00:00.000Z",
    );
    expect(nextDigestTime(new Date("2026-10-07T00:00:00Z"), "Asia/Kolkata").toISOString()).toBe(
      "2026-10-07T02:30:00.000Z",
    );
  });
});

describe("timezone validation", () => {
  it("accepts IANA zones and rejects anything else", () => {
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    for (const bad of ["", "Mars/Olympus", "<script>", "x".repeat(80)])
      expect(isValidTimeZone(bad)).toBe(false);
  });
});
