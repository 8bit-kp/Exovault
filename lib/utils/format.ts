/**
 * Deterministic display formatting. Server Components render these, so output
 * must not depend on the server's locale or timezone. Until users can set a
 * timezone (M2, spec Part 10), times are shown in UTC and labelled as such.
 */

const DEFAULT_TIME_ZONE = "UTC";

export interface FormatOptions {
  timeZone?: string;
}

/** "6 Oct 2026" */
export function formatDate(
  value: Date | string,
  { timeZone = DEFAULT_TIME_ZONE }: FormatOptions = {},
): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(toDate(value));
}

/** "6 Oct 2026, 14:20 UTC" */
export function formatDateTime(
  value: Date | string,
  { timeZone = DEFAULT_TIME_ZONE }: FormatOptions = {},
): string {
  const date = toDate(value);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(date);
  return `${formatDate(date, { timeZone })}, ${time} ${timeZoneLabel(timeZone)}`;
}

/** "October 2026" — timeline group headings. */
export function formatMonthYear(
  value: Date | string,
  { timeZone = DEFAULT_TIME_ZONE }: FormatOptions = {},
): string {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone }).format(toDate(value));
}

/** Stable sortable key for month grouping, e.g. "2026-10". */
export function monthKey(value: Date | string, { timeZone = DEFAULT_TIME_ZONE }: FormatOptions = {}): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone,
  }).formatToParts(toDate(value));
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  return `${year}-${month}`;
}

/** Machine-readable value for <time dateTime>. */
export function isoString(value: Date | string): string {
  return toDate(value).toISOString();
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function timeZoneLabel(timeZone: string): string {
  return timeZone === "UTC" || timeZone === "Etc/UTC" ? "UTC" : timeZone;
}

function toDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid date");
  }
  return date;
}
