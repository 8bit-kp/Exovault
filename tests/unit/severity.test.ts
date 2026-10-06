import { describe, expect, it } from "vitest";
import type { ExposedDataType, ExposureSourceType } from "@/lib/domain/exposure";
import { classifySeverity, displayPriority } from "@/lib/domain/severity";

const sev = (dataTypes: ExposedDataType[], sourceType: ExposureSourceType = "breach") =>
  classifySeverity({ dataTypes, sourceType }).severity;

describe("classifySeverity (spec 7.6 matrix)", () => {
  it.each<[ExposedDataType[], string]>([
    [["email", "password_plaintext"], "critical"],
    [["email", "auth_token"], "critical"],
    [["email", "security_qa"], "critical"],
    [["email", "financial"], "critical"],
    [["email", "password_hash"], "high"],
    [["email", "government_id"], "high"],
    [["email", "mfa_backup_codes"], "high"],
    [["email", "physical_address", "phone"], "high"],
    [["email", "phone"], "medium"],
    [["email", "date_of_birth"], "medium"],
    [["email", "ip_address"], "medium"],
    [["email", "username"], "medium"],
    [["email", "physical_address"], "medium"],
    [["email"], "low"],
    [["email", "name"], "low"],
    [["profile"], "low"],
    [["other"], "low"],
    [[], "info"],
  ])("%j → %s", (types, expected) => {
    expect(sev(types)).toBe(expected);
  });

  it("treats any stealer-log source as critical regardless of categories", () => {
    expect(sev(["email"], "stealer_log")).toBe("critical");
    expect(sev([], "stealer_log")).toBe("critical");
  });

  it("is order-independent and takes the most severe applicable rule", () => {
    expect(sev(["name", "password_hash", "email", "password_plaintext"])).toBe("critical");
    expect(sev(["password_plaintext", "email"])).toBe(sev(["email", "password_plaintext"]));
  });

  it("is monotonic: adding a data category never lowers severity", () => {
    const all: ExposedDataType[] = [
      "email",
      "name",
      "username",
      "password_plaintext",
      "password_hash",
      "auth_token",
      "security_qa",
      "financial",
      "government_id",
      "physical_address",
      "phone",
      "date_of_birth",
      "ip_address",
      "mfa_backup_codes",
      "profile",
      "other",
    ];
    const rank = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
    for (const a of all) {
      for (const b of all) {
        expect(rank[sev([a, b])]).toBeGreaterThanOrEqual(rank[sev([a])]);
      }
    }
  });

  it("explains its decision", () => {
    expect(classifySeverity({ dataTypes: ["email", "password_hash"], sourceType: "breach" }).reason).toMatch(
      /password_hash/,
    );
  });
});

describe("displayPriority (age modifier)", () => {
  const now = new Date("2026-10-06T00:00:00Z");
  it("lowers exposures older than 7 years by one level", () => {
    expect(displayPriority("critical", new Date("2018-01-01"), now)).toBe("high");
    expect(displayPriority("medium", new Date("2015-01-01"), now)).toBe("low");
  });
  it("never goes below Low, and leaves recent or undated exposures alone", () => {
    expect(displayPriority("low", new Date("2010-01-01"), now)).toBe("low");
    expect(displayPriority("info", new Date("2010-01-01"), now)).toBe("info");
    expect(displayPriority("critical", new Date("2024-01-01"), now)).toBe("critical");
    expect(displayPriority("critical", null, now)).toBe("critical");
  });
});
