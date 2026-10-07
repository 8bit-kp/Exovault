import { describe, expect, it } from "vitest";
import { REMEDIATION_STATES } from "@/lib/domain/exposure";
import {
  canTransitionRemediation,
  CHECKLIST_KEYS,
  getRemediationChecklist,
  stateFromChecklist,
} from "@/lib/domain/remediation";

describe("remediation transitions (spec 7.7)", () => {
  it.each([
    ["open", "in_progress", true],
    ["open", "remediated", true],
    ["open", "dismissed", true],
    ["in_progress", "remediated", true],
    ["in_progress", "dismissed", true],
    ["in_progress", "open", true],
    ["remediated", "open", true],
    ["remediated", "in_progress", true],
    ["dismissed", "open", true],
    ["dismissed", "remediated", false],
    ["dismissed", "in_progress", false],
    ["remediated", "dismissed", false],
  ] as const)("%s → %s: %s", (from, to, allowed) => {
    expect(canTransitionRemediation(from, to)).toBe(allowed);
  });

  it("never allows a no-op transition", () => {
    for (const state of REMEDIATION_STATES) expect(canTransitionRemediation(state, state)).toBe(false);
  });
});

describe("getRemediationChecklist", () => {
  const keys = (
    dataTypes: Parameters<typeof getRemediationChecklist>[0]["dataTypes"],
    sourceType: "breach" | "stealer_log" = "breach",
  ) => getRemediationChecklist({ dataTypes, sourceType }).map((i) => i.key);

  it("covers the spec 13.6 basics for a password exposure", () => {
    expect(keys(["email", "password_hash"])).toEqual([
      "change-password",
      "update-reused-passwords",
      "enable-mfa",
      "review-account-activity",
    ]);
  });

  it("cleans the device first for malware logs", () => {
    expect(keys(["email"], "stealer_log")[0]).toBe("clean-device");
  });

  it("adds data-specific steps", () => {
    expect(keys(["email", "security_qa", "financial", "government_id", "phone"])).toEqual(
      expect.arrayContaining([
        "change-security-questions",
        "watch-financial-statements",
        "protect-identity",
        "secure-phone-number",
      ]),
    );
  });

  it("suggests phishing awareness when no password was exposed", () => {
    expect(keys(["email", "name"])).toEqual(["review-account-activity", "watch-phishing"]);
  });

  it("only produces known, unique, stable keys", () => {
    const all = keys(
      ["email", "password_plaintext", "security_qa", "financial", "government_id", "phone"],
      "stealer_log",
    );
    expect(new Set(all).size).toBe(all.length);
    for (const key of all) expect(CHECKLIST_KEYS).toContain(key);
  });
});

describe("stateFromChecklist", () => {
  it("open → in progress → remediated as items are ticked", () => {
    expect(stateFromChecklist("open", 0, 4)).toBe("open");
    expect(stateFromChecklist("open", 1, 4)).toBe("in_progress");
    expect(stateFromChecklist("in_progress", 4, 4)).toBe("remediated");
  });

  it("goes back when items are unticked", () => {
    expect(stateFromChecklist("remediated", 3, 4)).toBe("in_progress");
    expect(stateFromChecklist("in_progress", 0, 4)).toBe("open");
  });

  it("leaves a dismissed exposure dismissed", () => {
    expect(stateFromChecklist("dismissed", 4, 4)).toBe("dismissed");
  });
});
