import { describe, expect, it } from "vitest";
import { availableFrequencies, cronDueBy, describeCronInterval } from "@/lib/domain/monitoring";
import { isAuthorizedCronRequest } from "@/server/services/scheduler/scheduled-jobs";

describe("scheduler capabilities (D-039)", () => {
  it("offers every frequency with the worker, and only honourable ones with a cron", () => {
    expect(availableFrequencies(null)).toEqual(["6h", "12h", "24h"]);
    expect(availableFrequencies(1440)).toEqual(["24h"]); // Vercel Hobby: once a day
    expect(availableFrequencies(360)).toEqual(["6h", "12h", "24h"]);
    expect(availableFrequencies(480)).toEqual(["12h", "24h"]);
    expect(availableFrequencies(15)).toEqual(["6h", "12h", "24h"]);
  });

  it("claims half an interval ahead, so jittered schedules never skip a cron run", () => {
    const now = new Date("2026-10-12T06:00:00Z");
    expect(cronDueBy(now, 1440).toISOString()).toBe("2026-10-12T18:00:00.000Z");
    // Daily, ±10% jitter: the next scan lands 21.6–26.4 h after this run, inside the next run's window.
    const nextRun = new Date(now.getTime() + 24 * 3_600_000);
    const latestNextScan = new Date(now.getTime() + 26.4 * 3_600_000);
    expect(latestNextScan <= cronDueBy(nextRun, 1440)).toBe(true);
  });

  it("describes the cadence in plain words", () => {
    expect(describeCronInterval(1440)).toBe("once a day");
    expect(describeCronInterval(360)).toBe("every 6 hours");
    expect(describeCronInterval(60)).toBe("every hour");
    expect(describeCronInterval(15)).toBe("every 15 minutes");
  });
});

describe("cron authorization", () => {
  const secret = "s".repeat(40);
  it("accepts only the exact bearer secret", () => {
    expect(isAuthorizedCronRequest(`Bearer ${secret}`, secret)).toBe(true);
    expect(isAuthorizedCronRequest(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isAuthorizedCronRequest(secret, secret)).toBe(false);
    expect(isAuthorizedCronRequest(null, secret)).toBe(false);
  });
  it("is never open when no secret is configured", () => {
    expect(isAuthorizedCronRequest("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedCronRequest("Bearer undefined", undefined)).toBe(false);
  });
});
