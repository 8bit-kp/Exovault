import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatMonthYear, monthKey, pluralize } from "@/lib/utils/format";

describe("display formatting", () => {
  const instant = "2026-10-06T23:30:00.000Z";

  it("formats in UTC by default and says so, regardless of the server's timezone", () => {
    expect(formatDate(instant)).toBe("6 Oct 2026");
    expect(formatDateTime(instant)).toBe("6 Oct 2026, 23:30 UTC");
  });

  it("honours an explicit timezone (date can roll over)", () => {
    expect(formatDate(instant, { timeZone: "Asia/Kolkata" })).toBe("7 Oct 2026");
    expect(formatDateTime(instant, { timeZone: "Asia/Kolkata" })).toBe("7 Oct 2026, 05:00 Asia/Kolkata");
  });

  it("builds sortable month keys and readable month labels", () => {
    expect(monthKey(instant)).toBe("2026-10");
    expect(formatMonthYear(instant)).toBe("October 2026");
  });

  it("throws on invalid dates instead of rendering 'Invalid Date'", () => {
    expect(() => formatDate("not a date")).toThrow(RangeError);
  });

  it("pluralizes counts", () => {
    expect(pluralize(1, "source")).toBe("1 source");
    expect(pluralize(3, "source")).toBe("3 sources");
    expect(pluralize(0, "identity", "identities")).toBe("0 identities");
  });
});
