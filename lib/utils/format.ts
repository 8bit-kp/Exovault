/**
 * Deterministic display formatting. Output never depends on the server's own
 * locale or timezone. Times are shown in the signed-in user's timezone
 * (spec Part 10: store UTC, display local): the server registers a
 * per-request provider (lib/auth/request-timezone.ts); without one (client
 * components, tests, the worker) the default is UTC, always labelled.
 */

let timeZoneProvider: (() => string) | undefined;

/** Registered once by server code; returns the current request's timezone. */
export function setDefaultTimeZoneProvider(provider: (() => string) | undefined): void {
  timeZoneProvider = provider;
}

function defaultTimeZone(): string {
  try {
    return timeZoneProvider?.() ?? "UTC";
  } catch {
    return "UTC";
  }
}

export interface FormatOptions {
  timeZone?: string;
}

/** "6 Oct 2026" */
export function formatDate(
  value: Date | string,
  { timeZone = defaultTimeZone() }: FormatOptions = {},
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
  { timeZone = defaultTimeZone() }: FormatOptions = {},
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
  { timeZone = defaultTimeZone() }: FormatOptions = {},
): string {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone }).format(toDate(value));
}

/** Stable sortable key for month grouping, e.g. "2026-10". */
export function monthKey(value: Date | string, { timeZone = defaultTimeZone() }: FormatOptions = {}): string {
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

/** "UTC", or a short offset such as "GMT+5:30" that reads well next to a time. */
function timeZoneLabel(timeZone: string): string {
  if (timeZone === "UTC" || timeZone === "Etc/UTC") return "UTC";
  try {
    const part = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    return part ?? timeZone;
  } catch {
    return timeZone;
  }
}

function toDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid date");
  }
  return date;
}
