import type { ExposureSeverity } from "./exposure";
import { SEVERITY_RANK } from "./severity";

/**
 * Notification rules (spec Part 10). Pure: everything time-related takes
 * `now`, and timezone maths uses Intl, so it's deterministic and testable.
 */
export const NOTIFICATION_CHANNELS = ["email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_KINDS = ["new_exposure", "exposure_changed"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const NOTIFICATION_STATUSES = ["pending", "sending", "sent", "suppressed", "failed"] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const SUPPRESSION_REASONS = ["email_disabled", "below_min_severity", "exposure_removed"] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

export const DELIVERY_MODES = ["immediate", "digest"] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export interface NotificationPreferences {
  emailEnabled: boolean;
  minSeverity: ExposureSeverity;
  mode: DeliveryMode;
  quietHours: { enabled: boolean; start: string; end: string };
  timezone: string;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  emailEnabled: true,
  minSeverity: "medium",
  mode: "immediate",
  quietHours: { enabled: false, start: "22:00", end: "07:00" },
  timezone: "UTC",
};

/** Local hour for the daily digest. */
export const DIGEST_HOUR = 8;

export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Dedupe key (spec Part 10: identity + fingerprint + channel). The event
 * part distinguishes "first found" from "got worse", and the severity in
 * the changed key means each escalation alerts once, never repeats (D-033).
 */
export function dedupeKey(input: {
  identityId: string;
  fingerprint: string;
  channel: NotificationChannel;
  kind: NotificationKind;
  severity: ExposureSeverity;
}): string {
  const event = input.kind === "new_exposure" ? "new" : `changed:${input.severity}`;
  return `${input.identityId}:${input.fingerprint}:${input.channel}:${event}`;
}

/** "Materially changed" (D-033): the severity went up. New data that doesn't raise severity isn't worth an alert. */
export function isMaterialChange(previous: ExposureSeverity, current: ExposureSeverity): boolean {
  return SEVERITY_RANK[current] > SEVERITY_RANK[previous];
}

export function suppressionReason(
  severity: ExposureSeverity,
  prefs: Pick<NotificationPreferences, "emailEnabled" | "minSeverity">,
): SuppressionReason | null {
  if (!prefs.emailEnabled) return "email_disabled";
  if (SEVERITY_RANK[severity] < SEVERITY_RANK[prefs.minSeverity]) return "below_min_severity";
  return null;
}

function localMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  return hour * 60 + minute;
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Whether `now` falls inside quiet hours (handles windows that cross midnight). */
export function inQuietHours(
  now: Date,
  prefs: Pick<NotificationPreferences, "quietHours" | "timezone">,
): boolean {
  if (!prefs.quietHours.enabled) return false;
  const local = localMinutes(now, prefs.timezone);
  const start = toMinutes(prefs.quietHours.start);
  const end = toMinutes(prefs.quietHours.end);
  if (start === end) return false;
  return start < end ? local >= start && local < end : local >= start || local < end;
}

/**
 * Earliest time an immediate alert may be sent: now, or the end of quiet
 * hours. Minute precision; on a DST change day the result can be off by the
 * shift (documented in D-033).
 */
export function nextDeliveryTime(
  now: Date,
  prefs: Pick<NotificationPreferences, "quietHours" | "timezone">,
): Date {
  if (!inQuietHours(now, prefs)) return now;
  const local = localMinutes(now, prefs.timezone);
  const end = toMinutes(prefs.quietHours.end);
  const wait = (end - local + 1440) % 1440;
  const at = new Date(now.getTime() + wait * 60_000);
  at.setUTCSeconds(0, 0);
  return at;
}

/** Next daily digest slot: DIGEST_HOUR local time, today if still ahead, else tomorrow. */
export function nextDigestTime(now: Date, timeZone: string, hour = DIGEST_HOUR): Date {
  const local = localMinutes(now, timeZone);
  const wait = (hour * 60 - local + 1440) % 1440 || 1440;
  const at = new Date(now.getTime() + wait * 60_000);
  at.setUTCSeconds(0, 0);
  return at;
}
