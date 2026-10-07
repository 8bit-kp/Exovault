import { describe, expect, it } from "vitest";
import {
  computeNextScanAt,
  firstScheduledScanAt,
  FREQUENCY_MS,
  MONITORING_FREQUENCIES,
} from "@/lib/domain/monitoring";

const now = new Date("2026-10-07T12:00:00Z");

describe("computeNextScanAt", () => {
  it.each(MONITORING_FREQUENCIES)("stays within ±10%% of the %s interval", (frequency) => {
    const interval = FREQUENCY_MS[frequency];
    const earliest = computeNextScanAt(now, frequency, () => 0).getTime() - now.getTime();
    const latest = computeNextScanAt(now, frequency, () => 0.999999).getTime() - now.getTime();
    const middle = computeNextScanAt(now, frequency, () => 0.5).getTime() - now.getTime();
    expect(earliest).toBe(interval * 0.9);
    expect(latest).toBeLessThanOrEqual(interval * 1.1);
    expect(latest).toBeGreaterThan(interval * 1.09);
    expect(middle).toBe(interval);
  });

  it("spreads identities enabled at the same moment", () => {
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const times = new Set(Array.from({ length: 50 }, () => computeNextScanAt(now, "6h", random).getTime()));
    expect(times.size).toBeGreaterThan(45);
  });
});

describe("firstScheduledScanAt", () => {
  it("continues from a recent scan instead of scanning again right away", () => {
    const lastScan = new Date(now.getTime() - 60 * 60_000);
    const next = firstScheduledScanAt(now, lastScan, "6h", () => 0.5);
    expect(next.getTime()).toBe(lastScan.getTime() + FREQUENCY_MS["6h"]);
  });

  it("schedules within 1–5 minutes when never scanned or overdue", () => {
    for (const lastScan of [null, new Date(now.getTime() - 3 * 24 * 60 * 60_000)]) {
      for (const r of [0, 0.5, 0.999]) {
        const delta = firstScheduledScanAt(now, lastScan, "24h", () => r).getTime() - now.getTime();
        expect(delta).toBeGreaterThanOrEqual(60_000);
        expect(delta).toBeLessThanOrEqual(5 * 60_000);
      }
    }
  });
});
